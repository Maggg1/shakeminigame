// Lightweight API helper for the game backend
const API = (window.API_BASE || window.VITE_API_BASE || (window.location && window.location.origin && window.location.origin.indexOf('github.io') !== -1 ? window.location.origin : undefined) ) || 'https://minigamebackend.onrender.com';

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
  try {
    return await getJSON('/rewards/definitions');
  } catch (e) {
    // Network failed (server down or CORS). Provide a small local fallback so the UI can still show a reward table.
    console.warn('[game-api] Failed loading /rewards/definitions, returning local fallback defs:', e);
    const fallback = {
      rewards: [
        { id: 'small', title: 'Small Reward', description: 'Small reward (1 point)', tier: 'small', pointsRequired: 1 },
        { id: 'medium', title: 'Medium Reward', description: 'Medium reward (5 points)', tier: 'medium', pointsRequired: 5 },
        { id: 'strong', title: 'Strong Reward', description: 'Strong reward (10 points)', tier: 'strong', pointsRequired: 10 },
        { id: 'big', title: 'Big Reward', description: 'Big reward (20 points)', tier: 'big', pointsRequired: 20 },
        { id: 'premium', title: 'Premium Reward', description: 'Premium reward (40 points)', tier: 'premium', pointsRequired: 40 }
      ]
    };
    return fallback;
  }
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
