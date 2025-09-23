// Central API configuration for backend URL
// Use Vite's environment variables: define `VITE_BACKEND_URL` in a .env file or your dev environment.
// Priority: VITE_API_BASE -> VITE_BACKEND_URL -> localhost fallback
export const API = import.meta.env.VITE_API_BASE || import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001';

// Helpful debug output at runtime
try {
	// eslint-disable-next-line no-console
	console.debug('[config/api] API base set to', API);
} catch (e) {}
