import 'dotenv/config';

export const config = {
  port: Number(process.env.PORT) || 4000,
  mongoUri: process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/clinic_booking',
};

// Business limits for a published slot.
export const SLOT_LIMITS = {
  minMinutes: 5,
  maxMinutes: 8 * 60,
};
