// Lightweight API helper for the game backend
const API = (window.API_BASE || window.VITE_API_BASE || (window.location && window.location.origin && window.location.origin.indexOf('github.io') !== -1 ? window.location.origin : undefined) ) || 'http://localhost:3001';

function getAuthHeader() {
  try {
    const t = localStorage.getItem('userToken');
    return t ? { Authorization: 'Bearer ' + t } : {};
  } catch (e) {
    return {};
  }
}

async function postJSON(path, body) {
  const headers = Object.assign({ 'Content-Type': 'application/json' }, getAuthHeader());
  const res = await fetch(API + path, { method: 'POST', headers, body: JSON.stringify(body), credentials: 'include' });
  return await res.json();
}

async function getJSON(path) {
  const headers = Object.assign({}, getAuthHeader());
  const res = await fetch(API + path, { headers, credentials: 'include' });
  return await res.json();
}

async function getRewardDefinitions() {
  return await getJSON('/rewards/definitions');
}

async function shake(email) {
  return await postJSON('/shake', { email });
}

export default {
  API,
  getJSON,
  postJSON,
  getRewardDefinitions,
  shake
};
