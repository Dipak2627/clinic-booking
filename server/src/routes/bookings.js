import { Router } from 'express';
import { asyncHandler } from '../utils/asyncHandler.js';
import { validate } from '../middleware/validate.js';
import {
  cancelBookingQuery,
  createBookingBody,
  idParams,
  listBookingsQuery,
} from '../validators/schemas.js';
import * as bookingService from '../services/bookingService.js';

const router = Router();

// POST /api/bookings  -> a patient books a slot
router.post(
  '/',
  validate({ body: createBookingBody }),
  asyncHandler(async (req, res) => {
    const booking = await bookingService.createBooking(req.valid.body);
    res.status(201).location(`/api/bookings/${booking.id}`).json(booking);
  }),
);

// GET /api/bookings?patientEmail=...   or   ?clinicId=...
router.get(
  '/',
  validate({ query: listBookingsQuery }),
  asyncHandler(async (req, res) => {
    res.json(await bookingService.listBookings(req.valid.query));
  }),
);

// GET /api/bookings/:id
router.get(
  '/:id',
  validate({ params: idParams }),
  asyncHandler(async (req, res) => {
    res.json(await bookingService.getBookingOrThrow(req.valid.params.id));
  }),
);

// DELETE /api/bookings/:id?patientEmail=...  -> cancel; re-opens the slot
router.delete(
  '/:id',
  validate({ params: idParams, query: cancelBookingQuery }),
  asyncHandler(async (req, res) => {
    const booking = await bookingService.cancelBooking(
      req.valid.params.id,
      req.valid.query.patientEmail,
    );
    res.json(booking);
  }),
);

export default router;
