import mongoose from 'mongoose';
import { jsonOptions } from './jsonOptions.js';

export const SLOT_STATUS = Object.freeze({
  OPEN: 'open',
  BOOKED: 'booked',
  CANCELLED: 'cancelled',
});

const slotSchema = new mongoose.Schema(
  {
    clinicId: { type: mongoose.Schema.Types.ObjectId, ref: 'Clinic', required: true },
    // Optional practitioner. Overlap rules apply per (clinic, provider).
    provider: { type: String, trim: true, default: null },
    startsAt: { type: Date, required: true },
    endsAt: { type: Date, required: true },
    // `status` is the single source of truth for availability. Every transition
    // is a conditional atomic update (see services/bookingService.js).
    status: {
      type: String,
      enum: Object.values(SLOT_STATUS),
      default: SLOT_STATUS.OPEN,
      required: true,
    },
    cancelledAt: { type: Date, default: null },
  },
  { timestamps: true, toJSON: jsonOptions },
);

slotSchema.index({ clinicId: 1, startsAt: 1 });
slotSchema.index({ status: 1, startsAt: 1 });

export const Slot = mongoose.model('Slot', slotSchema);
