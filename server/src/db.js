import mongoose from 'mongoose';
import { Clinic } from './models/Clinic.js';
import { Slot } from './models/Slot.js';
import { Booking } from './models/Booking.js';

export async function connectDb(uri) {
  await mongoose.connect(uri);
  // Make sure indexes (notably the unique partial index on bookings) exist
  // BEFORE we accept traffic; the double-booking guarantee depends on it.
  await Promise.all([Clinic.init(), Slot.init(), Booking.init()]);
}

export async function disconnectDb() {
  await mongoose.disconnect();
}
