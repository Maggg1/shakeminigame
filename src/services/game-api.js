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
    const json = await res.json().catch(() => null);
    // Normalize a variety of server response shapes into { rewards: [...] }
    try {
      if (!json) throw new Error('empty-json');
      let rewards = null;
      if (Array.isArray(json)) {
        rewards = json;
      } else if (Array.isArray(json.rewards)) {
        rewards = json.rewards;
      } else if (Array.isArray(json.data) && json.data.length && json.data[0] && (json.data[0].pointsRequired || json.data[0].title || json.data[0].name)) {
        rewards = json.data;
      } else if (json.data && Array.isArray(json.data.rewards)) {
        rewards = json.data.rewards;
      } else if (json.result && Array.isArray(json.result.rewards)) {
        rewards = json.result.rewards;
      } else if (json.rewards && typeof json.rewards === 'object') {
        // sometimes API returns an object map — convert to array
        rewards = Object.values(json.rewards);
      } else {
        // Try to find any array-valued property at the top level that looks like rewards
        for (const k of Object.keys(json)) {
          const v = json[k];
          if (Array.isArray(v) && v.length > 0 && typeof v[0] === 'object') {
            const hasRewardLike = v.some(item => item && (item.title || item.name || item.pointsRequired || item.cost));
            if (hasRewardLike) { rewards = v; break; }
          }
        }
      }
      if (Array.isArray(rewards) && rewards.length > 0) return { rewards };
      // If shape didn't match, but json itself looks like a single reward object, wrap it
      if (json && (json.title || json.name || json.pointsRequired || json.cost)) return { rewards: [json] };
      // As a last resort, log the unexpected response so the developer can inspect it
      console.debug('[game-api] /rewards/definitions returned unexpected shape — json:', json);
      return { rewards: [] };
    } catch (e) {
      // If normalization fails, fall through to fallback below
      console.warn('[game-api] Unexpected /rewards/definitions shape or network error, using fallback', e);
      return { rewards: [] };
    }
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

// Claim points endpoint (server should persist available -> claimed/total)
// If the backend does not expose /claim, this will likely return 404 and callers should fallback.
async function claimPoints(email, points = 0) {
  try {
    const body = { email, points };
    const headers = { 'Content-Type': 'application/json' };
    try {
      const token = localStorage.getItem('userToken') || localStorage.getItem('emailAuth_token') || localStorage.getItem('authToken');
      if (token) headers['Authorization'] = `Bearer ${token}`;
    } catch (e) {}
    const res = await fetch(API_BASE + '/claim', { method: 'POST', headers, body: JSON.stringify(body), credentials: 'include' });
    if (!res.ok) return null;
    return await res.json();
  } catch (e) {
    return null;
  }
}

export default {
  getRewardDefinitions,
  shake
};
