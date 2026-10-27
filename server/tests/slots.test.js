import { afterAll, beforeAll, beforeEach, describe, expect, it } from '@jest/globals';
import request from 'supertest';
import { createApp } from '../src/app.js';
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

describe('POST /api/slots', () => {
  it('publishes a slot that starts out open', async () => {
    const res = await api.post('/api/slots').send({
      clinicId: clinic.id,
      provider: 'Dr. Rao',
      startsAt: inHours(24),
      endsAt: inHours(24.5),
    });

    expect(res.status).toBe(201);
    expect(res.headers.location).toBe(`/api/slots/${res.body.id}`);
    expect(res.body).toMatchObject({ clinicId: clinic.id, provider: 'Dr. Rao', status: 'open' });
  });

  it('rejects malformed input with a helpful, field-level error', async () => {
    const res = await api.post('/api/slots').send({
      clinicId: 'not-an-id',
      startsAt: 'tomorrow',
    });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    const fields = res.body.error.details.map((d) => d.field);
    expect(fields).toEqual(expect.arrayContaining(['clinicId', 'startsAt', 'endsAt']));
  });

  it('rejects a slot whose end is not after its start', async () => {
    const res = await api.post('/api/slots').send({
      clinicId: clinic.id,
      startsAt: inHours(25),
      endsAt: inHours(24),
    });

    expect(res.status).toBe(400);
    expect(res.body.error.details[0]).toMatchObject({
      field: 'endsAt',
      message: 'endsAt must be after startsAt',
    });
  });

  it('rejects a slot that starts in the past', async () => {
    const res = await api.post('/api/slots').send({
      clinicId: clinic.id,
      startsAt: inHours(-2),
      endsAt: inHours(-1),
    });

    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('SLOT_IN_PAST');
  });

  it('returns 404 for a clinic that does not exist', async () => {
    const res = await api.post('/api/slots').send({
      clinicId: '64b7f0c2a1b2c3d4e5f60718',
      startsAt: inHours(24),
      endsAt: inHours(25),
    });

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('CLINIC_NOT_FOUND');
  });

  it('rejects overlapping slots for the same clinic and provider', async () => {
    await createSlot(api, clinic.id, { startsAt: inHours(24), endsAt: inHours(25) });

    const res = await api.post('/api/slots').send({
      clinicId: clinic.id,
      startsAt: inHours(24.5),
      endsAt: inHours(25.5),
    });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('SLOT_OVERLAP');
  });

  it('allows back-to-back slots, and overlap between different providers', async () => {
    await createSlot(api, clinic.id, { provider: 'Dr. A', startsAt: inHours(24), endsAt: inHours(25) });

    const backToBack = await api
      .post('/api/slots')
      .send({ clinicId: clinic.id, provider: 'Dr. A', startsAt: inHours(25), endsAt: inHours(26) });
    const otherProvider = await api
      .post('/api/slots')
      .send({ clinicId: clinic.id, provider: 'Dr. B', startsAt: inHours(24), endsAt: inHours(25) });

    expect(backToBack.status).toBe(201);
    expect(otherProvider.status).toBe(201);
  });
});

describe('GET /api/slots', () => {
  it('filters by clinic and status, sorted by start time', async () => {
    const other = await createClinic(api, 'Other Clinic');
    const late = await createSlot(api, clinic.id, { startsAt: inHours(48), endsAt: inHours(49) });
    const early = await createSlot(api, clinic.id, { startsAt: inHours(24), endsAt: inHours(25) });
    await createSlot(api, other.id);
    await bookSlot(api, late.id);

    const all = await api.get('/api/slots').query({ clinicId: clinic.id });
    expect(all.status).toBe(200);
    expect(all.body.data.map((s) => s.id)).toEqual([early.id, late.id]);

    const open = await api.get('/api/slots').query({ clinicId: clinic.id, status: 'open' });
    expect(open.body.data.map((s) => s.id)).toEqual([early.id]);
  });

  it('paginates', async () => {
    for (let i = 0; i < 5; i += 1) {
      await createSlot(api, clinic.id, { startsAt: inHours(24 + i), endsAt: inHours(24.5 + i) });
    }

    const res = await api.get('/api/slots').query({ page: 2, limit: 2 });
    expect(res.body.data).toHaveLength(2);
    expect(res.body.pagination).toEqual({ page: 2, limit: 2, total: 5, totalPages: 3 });
  });

  it('rejects invalid query parameters', async () => {
    const res = await api.get('/api/slots').query({ status: 'sleeping', limit: 500 });

    expect(res.status).toBe(400);
    const fields = res.body.error.details.map((d) => d.field);
    expect(fields).toEqual(expect.arrayContaining(['status', 'limit']));
  });
});

describe('DELETE /api/slots/:id', () => {
  it('cancels an open slot', async () => {
    const slot = await createSlot(api, clinic.id);

    const res = await api.delete(`/api/slots/${slot.id}`);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: 'cancelled', bookingCancelled: false });
  });

  it('cannot be cancelled twice', async () => {
    const slot = await createSlot(api, clinic.id);
    await api.delete(`/api/slots/${slot.id}`);

    const res = await api.delete(`/api/slots/${slot.id}`);

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('SLOT_ALREADY_CANCELLED');
  });

  it('also cancels the patient booking when the slot was booked', async () => {
    const slot = await createSlot(api, clinic.id);
    const booking = (await bookSlot(api, slot.id, patient(1))).body;

    const res = await api.delete(`/api/slots/${slot.id}`);
    expect(res.body).toMatchObject({ status: 'cancelled', bookingCancelled: true });

    const after = await api.get(`/api/bookings/${booking.id}`);
    expect(after.body).toMatchObject({ status: 'cancelled', cancelledBy: 'clinic' });
  });

  it('returns 404 for unknown slots and 400 for malformed ids', async () => {
    const missing = await api.delete('/api/slots/64b7f0c2a1b2c3d4e5f60718');
    const malformed = await api.delete('/api/slots/123');

    expect(missing.status).toBe(404);
    expect(malformed.status).toBe(400);
  });
});
