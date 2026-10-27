import { Slot, SLOT_STATUS } from '../models/Slot.js';
import { Booking, BOOKING_STATUS } from '../models/Booking.js';
import { conflict, notFound, unprocessable } from '../utils/errors.js';
import { getClinicOrThrow } from './clinicService.js';

const ACTIVE_STATUSES = [SLOT_STATUS.OPEN, SLOT_STATUS.BOOKED];

export async function createSlot({ clinicId, provider, startsAt, endsAt }) {
  await getClinicOrThrow(clinicId);

  if (startsAt <= new Date()) {
    throw unprocessable('SLOT_IN_PAST', 'A slot must start in the future');
  }

  // A clinic cannot publish two overlapping active slots for the same provider.
  // Back-to-back slots (one ends exactly when the next starts) are fine.
  const overlapping = await Slot.findOne({
    clinicId,
    provider: provider ?? null,
    status: { $in: ACTIVE_STATUSES },
    startsAt: { $lt: endsAt },
    endsAt: { $gt: startsAt },
  });
  if (overlapping) {
    throw conflict(
      'SLOT_OVERLAP',
      `This slot overlaps an existing slot (${overlapping.startsAt.toISOString()} - ${overlapping.endsAt.toISOString()})`,
    );
  }

  return Slot.create({ clinicId, provider: provider ?? null, startsAt, endsAt });
}

export async function listSlots({ clinicId, provider, status, from, to, page, limit }) {
  const filter = {};
  if (clinicId) filter.clinicId = clinicId;
  if (provider) filter.provider = provider;
  if (status) filter.status = status;
  if (from || to) {
    filter.startsAt = {};
    if (from) filter.startsAt.$gte = from;
    if (to) filter.startsAt.$lte = to;
  }

  const [data, total] = await Promise.all([
    Slot.find(filter)
      .sort({ startsAt: 1, _id: 1 })
      .skip((page - 1) * limit)
      .limit(limit),
    Slot.countDocuments(filter),
  ]);

  return {
    data,
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  };
}

export async function getSlotOrThrow(id) {
  const slot = await Slot.findById(id);
  if (!slot) throw notFound('SLOT_NOT_FOUND', `Slot ${id} does not exist`);
  return slot;
}

/**
 * Cancel a slot (clinic side). If a patient had booked it, that booking is
 * cancelled as well and reported back so the caller can notify the patient.
 */
export async function cancelSlot(id) {
  const now = new Date();

  // Atomic transition open|booked -> cancelled. It returns the document as it
  // was BEFORE the update, so we know whether a booking was attached.
  const before = await Slot.findOneAndUpdate(
    { _id: id, status: { $in: ACTIVE_STATUSES } },
    { $set: { status: SLOT_STATUS.CANCELLED, cancelledAt: now } },
  );

  if (!before) {
    const existing = await Slot.findById(id);
    if (!existing) throw notFound('SLOT_NOT_FOUND', `Slot ${id} does not exist`);
    throw conflict('SLOT_ALREADY_CANCELLED', 'This slot has already been cancelled');
  }

  let bookingCancelled = false;
  if (before.status === SLOT_STATUS.BOOKED) {
    const result = await Booking.updateOne(
      { slotId: id, status: BOOKING_STATUS.CONFIRMED },
      { $set: { status: BOOKING_STATUS.CANCELLED, cancelledBy: 'clinic', cancelledAt: now } },
    );
    bookingCancelled = result.modifiedCount > 0;
  }

  const slot = await Slot.findById(id);
  return { slot, bookingCancelled };
}
