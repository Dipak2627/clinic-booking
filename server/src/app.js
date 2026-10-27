import express from 'express';
import cors from 'cors';
import clinicRoutes from './routes/clinics.js';
import slotRoutes from './routes/slots.js';
import bookingRoutes from './routes/bookings.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';

// The app is built by a factory and never calls listen(), so tests can drive
// it directly with supertest.
export function createApp() {
  const app = express();

  app.use(cors());
  app.use(express.json({ limit: '10kb' }));

  app.get('/api/health', (_req, res) => res.json({ status: 'ok' }));
  app.use('/api/clinics', clinicRoutes);
  app.use('/api/slots', slotRoutes);
  app.use('/api/bookings', bookingRoutes);

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
