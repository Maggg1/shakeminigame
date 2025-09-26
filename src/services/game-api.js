// Lightweight API helper for the game backend — minimal surface used by the app
const API_BASE = (window.API_BASE || window.VITE_API_BASE || (typeof window !== 'undefined' && window.location && window.location.origin && window.location.origin.indexOf('github.io') !== -1 ? window.location.origin : undefined) ) || 'https://minigamebackend.onrender.com';

async function getRewardDefinitions() {
  try {
    const headers = { 'Content-Type': 'application/json' };
    try {
      const token = localStorage.getItem('userToken') || localStorage.getItem('emailAuth_token') || localStorage.getItem('authToken');
      if (token) headers['Authorization'] = `Bearer ${token}`;
    } catch (e) {}
    const res = await fetch(API_BASE + '/rewards/definitions', { headers, credentials: 'include' });
    return await res.json();
  } catch (e) {
    // Network failed (server down or CORS). Provide a small local fallback so the UI can still show a reward table.
    console.warn('[game-api] Failed loading /rewards/definitions, returning local fallback defs:', e);
    return {
      rewards: [
        { id: 'small', title: 'Small Reward', description: 'Small reward (1 point)', tier: 'small', pointsRequired: 1 },
        { id: 'medium', title: 'Medium Reward', description: 'Medium reward (5 points)', tier: 'medium', pointsRequired: 5 },
        { id: 'strong', title: 'Strong Reward', description: 'Strong reward (10 points)', tier: 'strong', pointsRequired: 10 },
        { id: 'big', title: 'Big Reward', description: 'Big reward (20 points)', tier: 'big', pointsRequired: 20 },
        { id: 'premium', title: 'Premium Reward', description: 'Premium reward (40 points)', tier: 'premium', pointsRequired: 40 }
      ]
    };
  }
}

// Shake endpoint used by the UI. Accepts either (email) or (email, options).
async function shake(email, options = {}) {
  const body = Object.assign({ email }, (options && typeof options === 'object') ? options : {});
  const headers = { 'Content-Type': 'application/json' };
  try {
    const token = localStorage.getItem('userToken') || localStorage.getItem('emailAuth_token') || localStorage.getItem('authToken');
    if (token) headers['Authorization'] = `Bearer ${token}`;
  } catch (e) {}
  const res = await fetch(API_BASE + '/shake', { method: 'POST', headers, body: JSON.stringify(body), credentials: 'include' });
  return await res.json();
}

export default {
  getRewardDefinitions,
  shake
};
