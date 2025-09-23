import { API } from './api';

// Admin credentials may be supplied via env for other tooling, but login
// always goes to the backend for verification.
export const ADMIN_USERNAME = import.meta.env.VITE_ADMIN_USERNAME;
export const ADMIN_PASSWORD = import.meta.env.VITE_ADMIN_PASSWORD;

export async function verifyAdmin(username, password) {
  try {
    const res = await fetch(`${API.replace(/\/$/, '')}/admin/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });
    if (!res.ok) return { ok: false, status: res.status };
    const data = await res.json();
    return { ok: true, data };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}