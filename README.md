# Clinic Booking (MERN)

Clinics publish time slots, patients book them. **MongoDB + Express + React + Node.**

- `server/` – REST API (Express, Mongoose, zod) and the automated tests (Jest, supertest)
- `client/` – small React (Vite) UI to try the API

## Run it

```bash
docker compose up -d            # MongoDB on :27017 (or use any MongoDB / Atlas URI)
npm run install:all
cp server/.env.example server/.env
npm run dev:server              # http://localhost:4000
npm run dev:client              # http://localhost:5173 (proxies /api to the server)
npm test                        # server tests
```

Tests start an in-memory MongoDB by default (`mongodb-memory-server`, binary is
downloaded on first run). To use a real MongoDB instead:
`TEST_MONGODB_URI=mongodb://127.0.0.1:27017/clinic_booking_test npm test` (that database is wiped).

## API

All errors share one shape: `{ "error": { "code": "SLOT_ALREADY_BOOKED", "message": "...", "details": [...] } }`.

| Method & path | Purpose | Success |
|---|---|---|
| `POST /api/clinics` `{name, address?}` | create clinic | 201 |
| `GET /api/clinics`, `GET /api/clinics/:id` | list / read | 200 |
| `POST /api/slots` `{clinicId, startsAt, endsAt, provider?}` | publish slot | 201 |
| `GET /api/slots?clinicId&status&provider&from&to&page&limit` | list slots | 200 |
| `GET /api/slots/:id` | read slot | 200 |
| `DELETE /api/slots/:id` | clinic cancels slot (cancels its booking too, `bookingCancelled` in response) | 200 |
| `POST /api/bookings` `{slotId, patientName, patientEmail}` | book | 201 |
| `GET /api/bookings?patientEmail=` or `?clinicId=` (+`status`) | list bookings | 200 |
| `GET /api/bookings/:id` | read booking | 200 |
| `DELETE /api/bookings/:id?patientEmail=` | patient cancels; slot re-opens | 200 |

Status codes: `400` validation / bad id / bad JSON, `403` cancelling someone else's
booking, `404` unknown resource, `409` conflict (already booked, slot cancelled,
already cancelled, overlapping slot), `422` slot in the past.

## Booking rules

- A slot is `open`, `booked` or `cancelled`. Only a future, `open` slot can be booked.
- A slot can never have two confirmed bookings (see below).
- A patient can cancel only with the email used to book, and only before the slot starts. Cancelling re-opens the slot.
- A clinic cancelling a slot also cancels its booking.
- A clinic cannot publish overlapping slots for the same provider (back-to-back is fine).
- Slots must be 5 minutes – 8 hours long, with `endsAt` after `startsAt`, starting in the future.

## How double-booking is prevented

1. **Atomic claim.** Booking begins with one conditional update
   (`findOneAndUpdate({_id, status:'open', startsAt > now}, {status:'booked'})`).
   MongoDB applies single-document updates atomically, so of N simultaneous
   requests exactly one matches; the rest get `409 SLOT_ALREADY_BOOKED`.
2. **Unique partial index** on `bookings.slotId` where `status = 'confirmed'`.
   Even if application logic were bypassed, the database refuses a second
   confirmed booking. Cancelled bookings are excluded so a slot can be re-booked.

No transactions are needed, so a standalone MongoDB works. Races between booking,
cancelling a booking and cancelling a slot are handled with the same conditional
updates plus a re-check after insert (see `server/src/services/bookingService.js`).

## Tests (`server/tests`)

- `bookings.test.js` – booking/cancelling rules, ownership, validation errors
- `slots.test.js` – slot creation, validation, overlap, listing, clinic cancellation
- `concurrency.test.js` – 25 simultaneous bookers → exactly one `201`; repeated
  two-way races; booking vs. cancel vs. slot-cancel races, each checked against the
  invariant "`booked` ⇔ exactly one confirmed booking"; DB index safety net

## Known limitations

- No authentication: patients are identified by email, clinics are not authenticated.
- The overlap check when publishing slots is check-then-insert, so two simultaneous
  overlapping *publishes* could both succeed. It does not affect double-booking of a
  slot. A per-clinic lock or transaction would close it.
