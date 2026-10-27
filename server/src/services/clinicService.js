import { Clinic } from '../models/Clinic.js';
import { notFound } from '../utils/errors.js';

export async function createClinic({ name, address }) {
  return Clinic.create({ name, address: address ?? null });
}

export async function listClinics() {
  return Clinic.find().sort({ name: 1 });
}

export async function getClinicOrThrow(id) {
  const clinic = await Clinic.findById(id);
  if (!clinic) throw notFound('CLINIC_NOT_FOUND', `Clinic ${id} does not exist`);
  return clinic;
}
