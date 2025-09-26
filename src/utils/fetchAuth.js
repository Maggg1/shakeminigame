import { getIdToken } from '../services/auth';

const BACKEND_BASE = 'https://minigamebackend.onrender.com';

// fetchAuth: performs fetch with credentials included, attaches Authorization Bearer token
// obtained from Firebase (via getIdToken) or localStorage fallback. Retries once on 401 by
// forcing a token refresh.
export default async function fetchAuth(url, opts = {}, timeoutMs = 7000) {
  const doFetch = async (useRefreshedToken = false) => {
    const controller = new AbortController();
    const signal = controller.signal;
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      // try to obtain a token (do not force refresh unless requested)
      let token = null;
      try {
        token = await getIdToken(useRefreshedToken);
      } catch (e) {
        token = null;
      }
  if (!token) token = localStorage.getItem('authToken') || localStorage.getItem('emailAuth_token') || localStorage.getItem('userToken');

      const headers = Object.assign({}, opts.headers || {});
      if (token) headers['Authorization'] = `Bearer ${token}`;
      if (!headers['Content-Type'] && !(opts && opts.body)) headers['Content-Type'] = 'application/json';

      // If a relative path is passed (starts with '/'), resolve it against BACKEND_BASE
      let fetchUrl = url;
      try {
        if (typeof url === 'string' && url.startsWith('/')) fetchUrl = BACKEND_BASE.replace(/\/$/, '') + url;
      } catch (e) {}

      const res = await fetch(fetchUrl, { signal, ...opts, headers, credentials: opts.credentials ?? 'include' });
      const text = await res.text().catch(() => '');
      let json = null;
      try { json = text ? JSON.parse(text) : null; } catch (e) { /* ignore parse error */ }
      return { ok: res.ok, status: res.status, statusText: res.statusText, bodyText: text, json };
    } catch (err) {
      throw err;
    } finally {
      clearTimeout(timer);
    }
  };

  // First attempt (no forced refresh)
  let result = null;
  try {
    result = await doFetch(false);
  } catch (err) {
    // propagate network/abort errors
    throw err;
  }

  // If unauthorized, try refreshing token once and retry
  if (result && result.status === 401) {
    try {
      const retryResult = await doFetch(true);
      return retryResult;
    } catch (err) {
      // return original 401 result if retry fails
      return result;
    }
  }

  return result;
}
