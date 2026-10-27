import { useCallback, useEffect, useState } from 'react';
import { api } from './api.js';

const fmt = (iso) =>
  new Date(iso).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });

function useAction() {
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const run = async (fn, okMessage = '') => {
    setError('');
    setNotice('');
    try {
      const result = await fn();
      setNotice(okMessage);
      return result;
    } catch (e) {
      setError(e.message);
      return undefined;
    }
  };
  return { error, notice, run };
}

function Messages({ error, notice }) {
  return (
    <>
      {error && <p className="msg error" role="alert">{error}</p>}
      {notice && <p className="msg ok">{notice}</p>}
    </>
  );
}

function ClinicPanel({ clinic }) {
  const [slots, setSlots] = useState([]);
  const [form, setForm] = useState({ startsAt: '', endsAt: '' });
  const [patient, setPatient] = useState({ patientName: '', patientEmail: '' });
  const { error, notice, run } = useAction();

  const load = useCallback(async () => {
    const res = await api.listSlots({ clinicId: clinic.id });
    setSlots(res.data);
  }, [clinic.id]);

  useEffect(() => {
    load().catch(() => setSlots([]));
  }, [load]);

  const publish = async (e) => {
    e.preventDefault();
    // <input type="datetime-local"> is local time; the API wants ISO 8601.
    const body = {
      clinicId: clinic.id,
      startsAt: new Date(form.startsAt).toISOString(),
      endsAt: new Date(form.endsAt).toISOString(),
    };
    await run(async () => {
      await api.createSlot(body);
      await load();
    }, 'Slot published');
  };

  const book = (slot) =>
    run(async () => {
      await api.book({ slotId: slot.id, ...patient });
      await load();
    }, 'Booked! Use your email under "My bookings" to cancel.');

  const cancelSlot = (slot) =>
    run(async () => {
      await api.cancelSlot(slot.id);
      await load();
    }, 'Slot cancelled');

  return (
    <section>
      <h2>{clinic.name}</h2>
      <Messages error={error} notice={notice} />

      <form onSubmit={publish} className="row">
        <label>Starts <input type="datetime-local" required value={form.startsAt}
          onChange={(e) => setForm({ ...form, startsAt: e.target.value })} /></label>
        <label>Ends <input type="datetime-local" required value={form.endsAt}
          onChange={(e) => setForm({ ...form, endsAt: e.target.value })} /></label>
        <button type="submit">Publish slot</button>
      </form>

      <div className="row">
        <label>Your name <input value={patient.patientName}
          onChange={(e) => setPatient({ ...patient, patientName: e.target.value })} /></label>
        <label>Your email <input type="email" value={patient.patientEmail}
          onChange={(e) => setPatient({ ...patient, patientEmail: e.target.value })} /></label>
      </div>

      <ul className="slots">
        {slots.length === 0 && <li className="muted">No slots yet.</li>}
        {slots.map((s) => (
          <li key={s.id}>
            <span>{fmt(s.startsAt)} – {fmt(s.endsAt)}</span>
            <span className={`tag ${s.status}`}>{s.status}</span>
            <span className="actions">
              {s.status === 'open' && <button onClick={() => book(s)}>Book</button>}
              {s.status !== 'cancelled' && (
                <button className="secondary" onClick={() => cancelSlot(s)}>Cancel slot</button>
              )}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function MyBookings() {
  const [email, setEmail] = useState('');
  const [bookings, setBookings] = useState([]);
  const { error, notice, run } = useAction();

  const lookup = async (e) => {
    e?.preventDefault();
    const res = await run(() => api.listBookings(email));
    if (res) setBookings(res.data);
  };

  const cancel = async (b) => {
    await run(() => api.cancelBooking(b.id, email), 'Booking cancelled');
    lookup();
  };

  return (
    <section>
      <h2>My bookings</h2>
      <Messages error={error} notice={notice} />
      <form onSubmit={lookup} className="row">
        <label>Email <input type="email" required value={email}
          onChange={(e) => setEmail(e.target.value)} /></label>
        <button type="submit">Find</button>
      </form>
      <ul className="slots">
        {bookings.map((b) => (
          <li key={b.id}>
            <span>{b.slot ? fmt(b.slot.startsAt) : 'Unknown slot'} · {b.patientName}</span>
            <span className={`tag ${b.status}`}>{b.status}</span>
            <span className="actions">
              {b.status === 'confirmed' && (
                <button className="secondary" onClick={() => cancel(b)}>Cancel</button>
              )}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

export default function App() {
  const [clinics, setClinics] = useState([]);
  const [selectedId, setSelectedId] = useState('');
  const [name, setName] = useState('');
  const { error, run } = useAction();

  const loadClinics = useCallback(async () => {
    const res = await api.listClinics();
    setClinics(res.data);
    return res.data;
  }, []);

  useEffect(() => {
    loadClinics().catch(() => {});
  }, [loadClinics]);

  const addClinic = async (e) => {
    e.preventDefault();
    const created = await run(() => api.createClinic({ name }));
    if (created) {
      setName('');
      await loadClinics();
      setSelectedId(created.id);
    }
  };

  const selected = clinics.find((c) => c.id === selectedId);

  return (
    <main>
      <h1>Clinic Booking</h1>
      <Messages error={error} />
      <form onSubmit={addClinic} className="row">
        <label>New clinic <input required minLength={2} value={name}
          onChange={(e) => setName(e.target.value)} /></label>
        <button type="submit">Add</button>
        <label>Open clinic
          <select value={selectedId} onChange={(e) => setSelectedId(e.target.value)}>
            <option value="">Select…</option>
            {clinics.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </label>
      </form>
      {selected && <ClinicPanel key={selected.id} clinic={selected} />}
      <MyBookings />
    </main>
  );
}
