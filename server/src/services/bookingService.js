import { Slot, SLOT_STATUS } from '../models/Slot.js';
import { Booking, BOOKING_STATUS } from '../models/Booking.js';
import { conflict, forbidden, notFound } from '../utils/errors.js';

/*
 * HOW DOUBLE-BOOKING IS PREVENTED
 * -------------------------------
 * Two independent layers, so one bug can never create a double booking:
 *
 *  1. Atomic claim. Booking starts with ONE conditional update
 *       Slot.findOneAndUpdate({ _id, status: 'open', startsAt > now },
 *                             { status: 'booked' })
 *     MongoDB applies single-document updates atomically, so when N requests
 *     race for the same slot exactly one of them matches the filter. The rest
 *     get `null` back and are answered with 409. Only the winner goes on to
 *     insert the Booking row.
 *
 *  2. Unique partial index on bookings(slotId) WHERE status = 'confirmed'
 *     (see models/Booking.js). Even if the claim logic were bypassed, the
 *     database refuses a second confirmed booking for the same slot.
 *
 * No multi-document transaction is needed (so a standalone MongoDB works).
 */

async function attachSlots(bookings) {
  const slotIds = [...new Set(bookings.map((b) => String(b.slotId)))];
  const slots = await Slot.find({ _id: { $in: slotIds } });
  const byId = new Map(slots.map((s) => [String(s._id), s]));
  return bookings.map((b) => ({ ...b.toJSON(), slot: byId.get(String(b.slotId))?.toJSON() ?? null }));
}

async function explainFailedClaim(slotId) {
  const slot = await Slot.findById(slotId);
  if (!slot) return notFound('SLOT_NOT_FOUND', `Slot ${slotId} does not exist`);
  if (slot.status === SLOT_STATUS.CANCELLED) {
    return conflict('SLOT_CANCELLED', 'This slot has been cancelled by the clinic');
  }
  if (slot.status === SLOT_STATUS.BOOKED) {
    return conflict('SLOT_ALREADY_BOOKED', 'This slot has already been booked');
  }
  return conflict('SLOT_IN_PAST', 'This slot has already started and can no longer be booked');
}

export async function createBooking({ slotId, patientName, patientEmail }) {
  // Layer 1: atomic claim (open -> booked). `new: true` returns the updated slot.
  const slot = await Slot.findOneAndUpdate(
    { _id: slotId, status: SLOT_STATUS.OPEN, startsAt: { $gt: new Date() } },
    { $set: { status: SLOT_STATUS.BOOKED } },
    { new: true },
  );
  if (!slot) throw await explainFailedClaim(slotId);

  let booking;
  try {
    booking = await Booking.create({ slotId: slot._id, patientName, patientEmail });
  } catch (err) {
    if (err?.code === 11000) {
      // Layer 2 fired: a confirmed booking already exists. Leave the slot booked.
      throw conflict('SLOT_ALREADY_BOOKED', 'This slot has already been booked');
    }
    // Anything else (e.g. DB hiccup): give the slot back so it is not stuck.
    await Slot.updateOne({ _id: slot._id, status: SLOT_STATUS.BOOKED }, { $set: { status: SLOT_STATUS.OPEN } });
    throw err;
  }

  // The clinic may have cancelled the slot between our claim and the insert.
  // cancelSlot() only cancels bookings that exist when it runs, so re-check here.
  const latest = await Slot.findById(slot._id).select('status');
  if (!latest || latest.status === SLOT_STATUS.CANCELLED) {
    await Booking.updateOne(
      { _id: booking._id, status: BOOKING_STATUS.CONFIRMED },
      { $set: { status: BOOKING_STATUS.CANCELLED, cancelledBy: 'clinic', cancelledAt: new Date() } },
    );
    throw conflict('SLOT_CANCELLED', 'This slot has been cancelled by the clinic');
  }

  return { ...booking.toJSON(), slot: slot.toJSON() };
}

export async function getBookingOrThrow(id) {
  const booking = await Booking.findById(id);
  if (!booking) throw notFound('BOOKING_NOT_FOUND', `Booking ${id} does not exist`);
  const [withSlot] = await attachSlots([booking]);
  return withSlot;
}

export async function listBookings({ patientEmail, clinicId, status, page, limit }) {
  const filter = {};
  if (patientEmail) filter.patientEmail = patientEmail;
  if (status) filter.status = status;
  if (clinicId) {
    const slotIds = await Slot.find({ clinicId }).distinct('_id');
    filter.slotId = { $in: slotIds };
  }

  const [bookings, total] = await Promise.all([
    Booking.find(filter)
      .sort({ createdAt: -1, _id: -1 })
      .skip((page - 1) * limit)
      .limit(limit),
    Booking.countDocuments(filter),
  ]);

  return {
    data: await attachSlots(bookings),
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  };
}

/**
 * Cancel a booking (patient side). The patient proves ownership with the email
 * used to book. Cancelling re-opens the slot so someone else can take it.
 */
export async function cancelBooking(id, patientEmail) {
  const booking = await Booking.findById(id);
  if (!booking) throw notFound('BOOKING_NOT_FOUND', `Booking ${id} does not exist`);

  if (booking.patientEmail !== patientEmail) {
    throw forbidden('NOT_BOOKING_OWNER', 'patientEmail does not match the email this booking was made with');
  }
  if (booking.status === BOOKING_STATUS.CANCELLED) {
    throw conflict('BOOKING_ALREADY_CANCELLED', 'This booking has already been cancelled');
  }

  const slot = await Slot.findById(booking.slotId);
  if (slot && slot.startsAt <= new Date()) {
    throw conflict('SLOT_ALREADY_STARTED', 'A booking cannot be cancelled after its slot has started');
  }

  // Atomic confirmed -> cancelled. If two cancel requests race, only one wins.
  const cancelled = await Booking.findOneAndUpdate(
    { _id: id, status: BOOKING_STATUS.CONFIRMED },
    { $set: { status: BOOKING_STATUS.CANCELLED, cancelledBy: 'patient', cancelledAt: new Date() } },
    { new: true },
  );
  if (!cancelled) {
    throw conflict('BOOKING_ALREADY_CANCELLED', 'This booking has already been cancelled');
  }

  // Re-open the slot, but only if it is still 'booked' (a clinic-cancelled slot stays cancelled).
  await Slot.updateOne(
    { _id: booking.slotId, status: SLOT_STATUS.BOOKED },
    { $set: { status: SLOT_STATUS.OPEN } },
  );

  const [withSlot] = await attachSlots([cancelled]);
  return withSlot;
}
