// Central API configuration for backend URL
// Use Vite's environment variables: define `VITE_BACKEND_URL` in a .env file or your dev environment.
// Priority: VITE_API_BASE -> VITE_BACKEND_URL -> localhost fallback
// Priority: VITE_API_BASE -> explicit production backend -> VITE_BACKEND_URL -> localhost fallback
const PROD_BACKEND = 'https://minigamebackend.onrender.com';
const LOCAL_FALLBACK = 'http://localhost:3001';

export const API = import.meta.env.VITE_API_BASE || PROD_BACKEND || import.meta.env.VITE_BACKEND_URL || LOCAL_FALLBACK;

// Helpful debug output at runtime
try {
	// eslint-disable-next-line no-console
	console.debug('[config/api] API base set to', API);
} catch (e) {}
