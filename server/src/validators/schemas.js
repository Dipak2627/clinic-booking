import { z } from 'zod';
import { SLOT_LIMITS } from '../config.js';
import { SLOT_STATUS } from '../models/Slot.js';
import { BOOKING_STATUS } from '../models/Booking.js';

// ---------- reusable building blocks ----------

const objectId = (label) =>
  z
    .string({ required_error: `${label} is required`, invalid_type_error: `${label} must be a string` })
    .regex(/^[a-f\d]{24}$/i, `${label} must be a valid 24-character id`);

const text = (label, { min = 1, max = 100 } = {}) =>
  z
    .string({ required_error: `${label} is required`, invalid_type_error: `${label} must be a string` })
    .trim()
    .min(min, min === 1 ? `${label} must not be empty` : `${label} must be at least ${min} characters`)
    .max(max, `${label} must be at most ${max} characters`);

const email = (label) =>
  z
    .string({ required_error: `${label} is required`, invalid_type_error: `${label} must be a string` })
    .trim()
    .toLowerCase()
    .email(`${label} must be a valid email address`);

const isoDate = (label) =>
  z
    .string({ required_error: `${label} is required`, invalid_type_error: `${label} must be a string` })
    .datetime({
      offset: true,
      message: `${label} must be an ISO 8601 date-time, e.g. 2030-01-15T09:30:00Z`,
    })
    .transform((value) => new Date(value));

const pagination = {
  page: z.coerce.number().int().min(1, 'page must be 1 or greater').default(1),
  limit: z.coerce
    .number()
    .int()
    .min(1, 'limit must be 1 or greater')
    .max(100, 'limit must be at most 100')
    .default(20),
};

// ---------- shared ----------

export const idParams = z.object({ id: objectId('id') });

// ---------- clinics ----------

export const createClinicBody = z.object({
  name: text('name', { min: 2, max: 100 }),
  address: text('address', { max: 200 }).optional(),
});

// ---------- slots ----------

export const createSlotBody = z
  .object({
    clinicId: objectId('clinicId'),
    provider: text('provider').optional(),
    startsAt: isoDate('startsAt'),
    endsAt: isoDate('endsAt'),
  })
  .superRefine((value, ctx) => {
    const minutes = (value.endsAt - value.startsAt) / 60000;
    if (minutes <= 0) {
      ctx.addIssue({ code: 'custom', path: ['endsAt'], message: 'endsAt must be after startsAt' });
    } else if (minutes < SLOT_LIMITS.minMinutes) {
      ctx.addIssue({
        code: 'custom',
        path: ['endsAt'],
        message: `A slot must last at least ${SLOT_LIMITS.minMinutes} minutes`,
      });
    } else if (minutes > SLOT_LIMITS.maxMinutes) {
      ctx.addIssue({
        code: 'custom',
        path: ['endsAt'],
        message: `A slot can last at most ${SLOT_LIMITS.maxMinutes / 60} hours`,
      });
    }
  });

export const listSlotsQuery = z
  .object({
    clinicId: objectId('clinicId').optional(),
    provider: text('provider').optional(),
    status: z
      .enum(Object.values(SLOT_STATUS), {
        errorMap: () => ({ message: `status must be one of: ${Object.values(SLOT_STATUS).join(', ')}` }),
      })
      .optional(),
    from: isoDate('from').optional(),
    to: isoDate('to').optional(),
    ...pagination,
  })
  .superRefine((value, ctx) => {
    if (value.from && value.to && value.from > value.to) {
      ctx.addIssue({ code: 'custom', path: ['to'], message: 'to must not be before from' });
    }
  });

// ---------- bookings ----------

export const createBookingBody = z.object({
  slotId: objectId('slotId'),
  patientName: text('patientName', { min: 2, max: 100 }),
  patientEmail: email('patientEmail'),
});

export const cancelBookingQuery = z.object({
  patientEmail: email('patientEmail'),
});

export const listBookingsQuery = z
  .object({
    patientEmail: email('patientEmail').optional(),
    clinicId: objectId('clinicId').optional(),
    status: z
      .enum(Object.values(BOOKING_STATUS), {
        errorMap: () => ({ message: `status must be one of: ${Object.values(BOOKING_STATUS).join(', ')}` }),
      })
      .optional(),
    ...pagination,
  })
  .superRefine((value, ctx) => {
    // Bookings contain personal data: never list them unfiltered.
    if (!value.patientEmail && !value.clinicId) {
      ctx.addIssue({
        code: 'custom',
        path: ['patientEmail'],
        message: 'Provide patientEmail or clinicId to list bookings',
      });
    }
  });
