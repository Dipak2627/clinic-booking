import mongoose from 'mongoose';
import { jsonOptions } from './jsonOptions.js';

export const BOOKING_STATUS = Object.freeze({
  CONFIRMED: 'confirmed',
  CANCELLED: 'cancelled',
});

const bookingSchema = new mongoose.Schema(
  {
    slotId: { type: mongoose.Schema.Types.ObjectId, ref: 'Slot', required: true },
    patientName: { type: String, required: true, trim: true },
    patientEmail: { type: String, required: true, trim: true, lowercase: true },
    status: {
      type: String,
      enum: Object.values(BOOKING_STATUS),
      default: BOOKING_STATUS.CONFIRMED,
      required: true,
    },
    cancelledAt: { type: Date, default: null },
    cancelledBy: { type: String, enum: ['patient', 'clinic', null], default: null },
  },
  { timestamps: true, toJSON: jsonOptions },
);

// Database-level safety net: at most ONE confirmed booking per slot, no matter
// what the application code does. Cancelled bookings are kept for history and
// are excluded from the index, so a slot can be re-booked after a cancellation.
bookingSchema.index(
  { slotId: 1 },
  { unique: true, partialFilterExpression: { status: BOOKING_STATUS.CONFIRMED } },
);
bookingSchema.index({ patientEmail: 1, createdAt: -1 });

export const Booking = mongoose.model('Booking', bookingSchema);
