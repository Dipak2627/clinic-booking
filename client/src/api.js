// Thin fetch wrapper. API errors look like { error: { code, message, details } };
// we turn them into a readable Error so the UI can just show `err.message`.
async function request(path, { method = 'GET', body, query } = {}) {
  const qs = query ? `?${new URLSearchParams(query)}` : '';
  const res = await fetch(`/api${path}${qs}`, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const e = data?.error;
    const detail = e?.details?.map((d) => d.message).join('; ');
    throw new Error(detail || e?.message || `Request failed (${res.status})`);
  }
  return data;
}

export const api = {
  listClinics: () => request('/clinics'),
  createClinic: (body) => request('/clinics', { method: 'POST', body }),
  listSlots: (query) => request('/slots', { query: { limit: 100, ...query } }),
  createSlot: (body) => request('/slots', { method: 'POST', body }),
  cancelSlot: (id) => request(`/slots/${id}`, { method: 'DELETE' }),
  book: (body) => request('/bookings', { method: 'POST', body }),
  listBookings: (patientEmail) => request('/bookings', { query: { patientEmail } }),
  cancelBooking: (id, patientEmail) =>
    request(`/bookings/${id}`, { method: 'DELETE', query: { patientEmail } }),
};
