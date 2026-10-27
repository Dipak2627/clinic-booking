import { Router } from 'express';
import { asyncHandler } from '../utils/asyncHandler.js';
import { validate } from '../middleware/validate.js';
import { createClinicBody, idParams } from '../validators/schemas.js';
import * as clinicService from '../services/clinicService.js';

const router = Router();

// POST /api/clinics
router.post(
  '/',
  validate({ body: createClinicBody }),
  asyncHandler(async (req, res) => {
    const clinic = await clinicService.createClinic(req.valid.body);
    res.status(201).location(`/api/clinics/${clinic.id}`).json(clinic);
  }),
);

// GET /api/clinics
router.get(
  '/',
  asyncHandler(async (_req, res) => {
    res.json({ data: await clinicService.listClinics() });
  }),
);

// GET /api/clinics/:id
router.get(
  '/:id',
  validate({ params: idParams }),
  asyncHandler(async (req, res) => {
    res.json(await clinicService.getClinicOrThrow(req.valid.params.id));
  }),
);

export default router;
