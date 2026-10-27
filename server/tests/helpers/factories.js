import { Slot } from '../../src/models/Slot.js';

const HOUR = 60 * 60 * 1000;

/** ISO string `hours` from now (negative = in the past). */
export const inHours = (hours) => new Date(Date.now() + hours * HOUR).toISOString();

export async function createClinic(api, name = 'Green Valley Clinic') {
  const res = await api.post('/api/clinics').send({ name });
  if (res.status !== 201) throw new Error(`createClinic failed: ${JSON.stringify(res.body)}`);
  return res.body;
}

export async function createSlot(api, clinicId, overrides = {}) {
  const res = await api.post('/api/slots').send({
    clinicId,
    startsAt: inHours(24),
    endsAt: inHours(24.5),
    ...overrides,
  });
  if (res.status !== 201) throw new Error(`createSlot failed: ${JSON.stringify(res.body)}`);
  return res.body;
}

/** Insert a slot straight into the DB (needed for slots that already started). */
export async function insertSlotDirectly(clinicId, { startsAt, endsAt, status = 'open' }) {
  return Slot.create({ clinicId, startsAt, endsAt, status });
}

export const patient = (n = 1) => ({
  patientName: `Patient ${n}`,
  patientEmail: `patient${n}@example.com`,
});

export const bookSlot = (api, slotId, who = patient()) =>
  api.post('/api/bookings').send({ slotId, ...who });
