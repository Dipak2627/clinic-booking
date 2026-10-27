import { Router } from 'express';
import { asyncHandler } from '../utils/asyncHandler.js';
import { validate } from '../middleware/validate.js';
import { createSlotBody, idParams, listSlotsQuery } from '../validators/schemas.js';
import * as slotService from '../services/slotService.js';

const router = Router();

// POST /api/slots  -> a clinic publishes a time slot
router.post(
  '/',
  validate({ body: createSlotBody }),
  asyncHandler(async (req, res) => {
    const slot = await slotService.createSlot(req.valid.body);
    res.status(201).location(`/api/slots/${slot.id}`).json(slot);
  }),
);

// GET /api/slots?clinicId=&status=&provider=&from=&to=&page=&limit=
router.get(
  '/',
  validate({ query: listSlotsQuery }),
  asyncHandler(async (req, res) => {
    res.json(await slotService.listSlots(req.valid.query));
  }),
);

// GET /api/slots/:id
router.get(
  '/:id',
  validate({ params: idParams }),
  asyncHandler(async (req, res) => {
    res.json(await slotService.getSlotOrThrow(req.valid.params.id));
  }),
);

// DELETE /api/slots/:id  -> cancel a slot (also cancels its booking, if any)
router.delete(
  '/:id',
  validate({ params: idParams }),
  asyncHandler(async (req, res) => {
    const { slot, bookingCancelled } = await slotService.cancelSlot(req.valid.params.id);
    res.json({ ...slot.toJSON(), bookingCancelled });
  }),
);

export default router;
