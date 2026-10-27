import { afterAll, beforeAll, beforeEach, describe, expect, it } from '@jest/globals';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { clearTestDb, startTestDb, stopTestDb } from './helpers/testDb.js';
import { Slot } from '../src/models/Slot.js';
import {
  bookSlot,
  createClinic,
  createSlot,
  inHours,
  insertSlotDirectly,
  patient,
} from './helpers/factories.js';

const api = request(createApp());
let clinic;
let slot;

beforeAll(startTestDb);
afterAll(stopTestDb);
beforeEach(async () => {
  await clearTestDb();
  clinic = await createClinic(api);
  slot = await createSlot(api, clinic.id);
});

describe('POST /api/bookings', () => {
  it('books an open slot and marks the slot as booked', async () => {
    const res = await bookSlot(api, slot.id, { patientName: 'Asha Verma', patientEmail: 'Asha@Example.com ' });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      slotId: slot.id,
      patientName: 'Asha Verma',
      patientEmail: 'asha@example.com', // trimmed + lower-cased
      status: 'confirmed',
    });
    expect(res.body.slot.status).toBe('booked');

    const after = await api.get(`/api/slots/${slot.id}`);
    expect(after.body.status).toBe('booked');
  });

  it('refuses to book a slot that is already booked', async () => {
    await bookSlot(api, slot.id, patient(1));

    const res = await bookSlot(api, slot.id, patient(2));

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('SLOT_ALREADY_BOOKED');
  });

  it('refuses to book a cancelled slot', async () => {
    await api.delete(`/api/slots/${slot.id}`);

    const res = await bookSlot(api, slot.id);

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('SLOT_CANCELLED');
  });

  it('refuses to book a slot that has already started', async () => {
    const past = await insertSlotDirectly(clinic.id, {
      startsAt: new Date(Date.now() - 60 * 60 * 1000),
      endsAt: new Date(Date.now() + 60 * 60 * 1000),
    });

    const res = await bookSlot(api, past.id);

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('SLOT_IN_PAST');
  });

  it('returns 404 for an unknown slot', async () => {
    const res = await bookSlot(api, '64b7f0c2a1b2c3d4e5f60718');

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('SLOT_NOT_FOUND');
  });

  it('validates the payload', async () => {
    const res = await api.post('/api/bookings').send({
      slotId: 'abc',
      patientName: 'A',
      patientEmail: 'not-an-email',
    });

    expect(res.status).toBe(400);
    const fields = res.body.error.details.map((d) => d.field);
    expect(fields).toEqual(expect.arrayContaining(['slotId', 'patientName', 'patientEmail']));
  });

  it('returns a clear error for invalid JSON', async () => {
    const res = await api
      .post('/api/bookings')
      .set('Content-Type', 'application/json')
      .send('{ nope');

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_JSON');
  });
});

describe('DELETE /api/bookings/:id', () => {
  it('cancels the booking and re-opens the slot for someone else', async () => {
    const booking = (await bookSlot(api, slot.id, patient(1))).body;

    const cancel = await api.delete(`/api/bookings/${booking.id}`).query({ patientEmail: 'patient1@example.com' });
    expect(cancel.status).toBe(200);
    expect(cancel.body).toMatchObject({ status: 'cancelled', cancelledBy: 'patient' });

    const reopened = await api.get(`/api/slots/${slot.id}`);
    expect(reopened.body.status).toBe('open');

    const rebook = await bookSlot(api, slot.id, patient(2));
    expect(rebook.status).toBe(201);
  });

  it('only lets the patient who booked cancel', async () => {
    const booking = (await bookSlot(api, slot.id, patient(1))).body;

    const res = await api.delete(`/api/bookings/${booking.id}`).query({ patientEmail: 'patient2@example.com' });

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('NOT_BOOKING_OWNER');
    expect((await api.get(`/api/slots/${slot.id}`)).body.status).toBe('booked');
  });

  it('cannot cancel the same booking twice', async () => {
    const booking = (await bookSlot(api, slot.id, patient(1))).body;
    await api.delete(`/api/bookings/${booking.id}`).query({ patientEmail: 'patient1@example.com' });

    const res = await api.delete(`/api/bookings/${booking.id}`).query({ patientEmail: 'patient1@example.com' });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('BOOKING_ALREADY_CANCELLED');
  });

  it('cannot cancel once the slot has started', async () => {
    const soon = await insertSlotDirectly(clinic.id, {
      startsAt: new Date(Date.now() + 60 * 1000),
      endsAt: new Date(Date.now() + 31 * 60 * 1000),
    });
    const booking = (await bookSlot(api, soon.id, patient(1))).body;
    // Move the slot start into the past (appointment is under way).
    await Slot.updateOne({ _id: soon.id }, { $set: { startsAt: new Date(Date.now() - 1000) } });

    const res = await api.delete(`/api/bookings/${booking.id}`).query({ patientEmail: 'patient1@example.com' });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('SLOT_ALREADY_STARTED');
  });

  it('requires patientEmail and a known booking', async () => {
    const noEmail = await api.delete('/api/bookings/64b7f0c2a1b2c3d4e5f60718');
    const unknown = await api
      .delete('/api/bookings/64b7f0c2a1b2c3d4e5f60718')
      .query({ patientEmail: 'x@example.com' });

    expect(noEmail.status).toBe(400);
    expect(unknown.status).toBe(404);
  });
});

describe('GET /api/bookings', () => {
  it('lists a patient\'s bookings together with their slot', async () => {
    const second = await createSlot(api, clinic.id, { startsAt: inHours(72), endsAt: inHours(73) });
    const third = await createSlot(api, clinic.id, { startsAt: inHours(96), endsAt: inHours(97) });
    await bookSlot(api, slot.id, patient(1));
    await bookSlot(api, second.id, patient(1));
    await bookSlot(api, third.id, patient(2));

    const res = await api.get('/api/bookings').query({ patientEmail: 'patient1@example.com' });

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(2);
    expect(res.body.data[0].slot).toMatchObject({ clinicId: clinic.id });
  });

  it('lists a clinic\'s bookings', async () => {
    await bookSlot(api, slot.id, patient(1));

    const res = await api.get('/api/bookings').query({ clinicId: clinic.id });

    expect(res.body.data).toHaveLength(1);
  });

  it('refuses to list bookings without a filter (privacy)', async () => {
    const res = await api.get('/api/bookings');

    expect(res.status).toBe(400);
    expect(res.body.error.details[0].message).toMatch(/patientEmail or clinicId/);
  });
});
