import { afterAll, beforeAll, beforeEach, describe, expect, it } from '@jest/globals';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { Booking } from '../src/models/Booking.js';
import { Slot } from '../src/models/Slot.js';
import { clearTestDb, startTestDb, stopTestDb } from './helpers/testDb.js';
import { bookSlot, createClinic, createSlot, inHours, patient } from './helpers/factories.js';

const api = request(createApp());
let clinic;

beforeAll(startTestDb);
afterAll(stopTestDb);
beforeEach(async () => {
  await clearTestDb();
  clinic = await createClinic(api);
});

/**
 * The invariant the whole system exists to protect:
 *   - a slot has at most one confirmed booking
 *   - slot.status === 'booked'  <=>  exactly one confirmed booking exists
 *   - a cancelled slot has no confirmed booking
 */
async function expectConsistent(slotId) {
  const slot = await Slot.findById(slotId);
  const confirmed = await Booking.countDocuments({ slotId, status: 'confirmed' });

  expect(confirmed).toBeLessThanOrEqual(1);
  if (slot.status === 'booked') expect(confirmed).toBe(1);
  if (slot.status === 'open') expect(confirmed).toBe(0);
  if (slot.status === 'cancelled') expect(confirmed).toBe(0);
}

describe('concurrent bookings', () => {
  it('lets exactly one of 25 simultaneous requests win the same slot', async () => {
    const slot = await createSlot(api, clinic.id);

    const responses = await Promise.all(
      Array.from({ length: 25 }, (_, i) => bookSlot(api, slot.id, patient(i + 1))),
    );

    const statuses = responses.map((r) => r.status);
    expect(statuses.filter((s) => s === 201)).toHaveLength(1);
    expect(statuses.filter((s) => s === 409)).toHaveLength(24);
    responses
      .filter((r) => r.status === 409)
      .forEach((r) => expect(r.body.error.code).toBe('SLOT_ALREADY_BOOKED'));

    expect(await Booking.countDocuments({ slotId: slot.id, status: 'confirmed' })).toBe(1);
    await expectConsistent(slot.id);
  });

  it('is safe when two requests hit at the very same moment, repeated many times', async () => {
    for (let round = 0; round < 15; round += 1) {
      const slot = await createSlot(api, clinic.id, {
        startsAt: inHours(24 + round),
        endsAt: inHours(24.5 + round),
      });

      const [a, b] = await Promise.all([
        bookSlot(api, slot.id, patient(1)),
        bookSlot(api, slot.id, patient(2)),
      ]);

      expect([a.status, b.status].sort()).toEqual([201, 409]);
      await expectConsistent(slot.id);
    }
  });

  it('does not let concurrent bookings of DIFFERENT slots interfere', async () => {
    const slots = await Promise.all(
      Array.from({ length: 10 }, (_, i) =>
        createSlot(api, clinic.id, { startsAt: inHours(24 + i), endsAt: inHours(24.5 + i) }),
      ),
    );

    const responses = await Promise.all(slots.map((s, i) => bookSlot(api, s.id, patient(i + 1))));

    expect(responses.every((r) => r.status === 201)).toBe(true);
  });
});

describe('races involving cancellations', () => {
  it('stays consistent when a booking is cancelled while others race to re-book it', async () => {
    for (let round = 0; round < 8; round += 1) {
      const slot = await createSlot(api, clinic.id, {
        startsAt: inHours(24 + round),
        endsAt: inHours(24.5 + round),
      });
      const first = (await bookSlot(api, slot.id, patient(1))).body;

      await Promise.all([
        api.delete(`/api/bookings/${first.id}`).query({ patientEmail: 'patient1@example.com' }),
        ...Array.from({ length: 6 }, (_, i) => bookSlot(api, slot.id, patient(i + 2))),
      ]);

      await expectConsistent(slot.id);
    }
  });

  it('never leaves a confirmed booking on a slot the clinic cancels mid-booking', async () => {
    for (let round = 0; round < 15; round += 1) {
      const slot = await createSlot(api, clinic.id, {
        startsAt: inHours(24 + round),
        endsAt: inHours(24.5 + round),
      });

      await Promise.all([bookSlot(api, slot.id, patient(1)), api.delete(`/api/slots/${slot.id}`)]);

      const finalSlot = await Slot.findById(slot.id);
      expect(finalSlot.status).toBe('cancelled');
      await expectConsistent(slot.id);
    }
  });

  it('lets only one of several simultaneous cancellations of a booking succeed', async () => {
    const slot = await createSlot(api, clinic.id);
    const booking = (await bookSlot(api, slot.id, patient(1))).body;

    const responses = await Promise.all(
      Array.from({ length: 8 }, () =>
        api.delete(`/api/bookings/${booking.id}`).query({ patientEmail: 'patient1@example.com' }),
      ),
    );

    expect(responses.filter((r) => r.status === 200)).toHaveLength(1);
    expect(responses.filter((r) => r.status === 409)).toHaveLength(7);
    await expectConsistent(slot.id);
  });
});

describe('database-level safety net', () => {
  it('rejects a second confirmed booking for a slot even if the app logic is bypassed', async () => {
    const slot = await createSlot(api, clinic.id);
    const base = { slotId: slot.id, patientName: 'Direct Insert', patientEmail: 'direct@example.com' };

    await Booking.create(base);

    await expect(Booking.create(base)).rejects.toMatchObject({ code: 11000 });
  });

  it('still allows a new confirmed booking after the previous one was cancelled', async () => {
    const slot = await createSlot(api, clinic.id);
    const base = { slotId: slot.id, patientName: 'Direct Insert', patientEmail: 'direct@example.com' };
    await Booking.create({ ...base, status: 'cancelled' });

    await expect(Booking.create(base)).resolves.toBeDefined();
  });
});
