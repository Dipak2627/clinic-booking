import mongoose from 'mongoose';
import { jsonOptions } from './jsonOptions.js';

const clinicSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    address: { type: String, trim: true, default: null },
  },
  { timestamps: true, toJSON: jsonOptions },
);

export const Clinic = mongoose.model('Clinic', clinicSchema);
