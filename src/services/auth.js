import { auth } from '../firebase/config';
import { sendSignInLinkToEmail, isSignInWithEmailLink, signInWithEmailLink, getIdToken as firebaseGetIdToken, GoogleAuthProvider, signInWithPopup, signInWithRedirect, getRedirectResult } from 'firebase/auth';
import { API } from '../config/api';

const actionCodeSettings = {
  // URL you want to redirect back to. The domain (authDomain) must be whitelisted in Firebase console.
  url: window.location.origin + '/',
  handleCodeInApp: true
};

export async function sendVerificationCode(email) {
  try {
    await sendSignInLinkToEmail(auth, email, actionCodeSettings);
    // Store email locally so we can finish sign-in after the user clicks the link
    localStorage.setItem('emailForSignIn', email);
    return { success: true, message: 'Email link sent' };
  } catch (e) {
    console.error('Firebase sendSignInLinkToEmail error', e);
    // Map common Firebase errors to friendlier messages for the UI
    const code = e && e.code ? e.code : null;
    if (code === 'auth/operation-not-allowed') {
      const friendly = `Email Link sign-in is not enabled for this Firebase project. Enable "Email link (passwordless sign-in)" in the Firebase Console and add ${window.location.origin} to the project's Authorized domains.`;
      return { success: false, error: code, message: friendly, docs: 'https://firebase.google.com/docs/auth/web/email-link-auth' };
    }
    if (code === 'auth/quota-exceeded') {
      return { success: false, error: code, message: 'Exceeded daily quota for email sign-in. Use the Firebase Console for production testing.' };
    }
    // Fallback generic error
    return { success: false, error: code || String(e), message: e.message || String(e) };
  }
}

export async function verifyCode(email, code) {
  // Not used in email-link flow; return a stub indicating use of email-link flow
  return { success: false, message: 'Use email link flow' };
}

export async function signInWithEmail(email, code = null) {
  try {
    // If we are on a deep link that Firebase recognizes, complete sign-in
    if (isSignInWithEmailLink(auth, window.location.href)) {
      const storedEmail = localStorage.getItem('emailForSignIn') || email;
      const result = await signInWithEmailLink(auth, storedEmail, window.location.href);
      const user = result.user;
      // Obtain Firebase ID token to send to backend as Bearer token
      let idToken = null;
      try {
        idToken = await user.getIdToken();
      } catch (tokenErr) {
        console.warn('Could not get ID token from Firebase user', tokenErr);
      }

      localStorage.setItem('emailAuth_user', JSON.stringify({ email: user.email, uid: user.uid }));
      localStorage.setItem('emailAuth_loginTime', Date.now().toString());
      if (idToken) {
        localStorage.setItem('emailAuth_token', idToken);
        localStorage.setItem('authToken', idToken);
        // Exchange ID token for backend session cookie (if backend supports it)
        try {
          const sessionRes = await fetch(`${API.replace(/\/$/, '')}/auth/session`, {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ idToken })
          });
          try {
            const sessionText = await sessionRes.text().catch(() => '');
            // Try parsing JSON first (compatibility endpoint that returns { ok: true, token })
            let parsed = null;
            try { parsed = sessionText ? JSON.parse(sessionText) : null; } catch (e) { parsed = null; }

            if (parsed && parsed.ok && parsed.token) {
              // Server returned a compatibility token — save it where the app expects it
              try {
                localStorage.setItem('emailAuth_token', parsed.token);
                localStorage.setItem('authToken', parsed.token);
              } catch (e) {}
              try { localStorage.setItem('sessionEstablished', '1'); localStorage.setItem('sessionExchangeAvailable', '1'); } catch(e){}
              console.debug('establishSession: received server token and saved to localStorage.emailAuth_token');
            } else if (sessionRes.status === 404 || (typeof sessionText === 'string' && sessionText.indexOf('Cannot POST /auth/session') !== -1)) {
              console.warn('establishSession: backend does not expose /auth/session', sessionRes.status, sessionText);
              try { localStorage.setItem('sessionExchangeAvailable', '0'); } catch (e) {}
            } else if (!sessionRes.ok) {
              console.warn('establishSession: backend did not accept token', sessionRes.status, sessionText);
            } else {
              // backend created a server session (cookie); remember that
              try { localStorage.setItem('sessionEstablished', '1'); localStorage.setItem('sessionExchangeAvailable', '1'); } catch(e){}
            }
          } catch (e) {
            console.warn('establishSession: error reading response', e);
          }
        } catch (e) {
          console.warn('establishSession network error', e);
        }
      }

      return { success: true, user: { email: user.email, uid: user.uid, token: idToken } };
    }
    return { success: false, message: 'No email link detected in URL' };
  } catch (e) {
    console.error('Firebase signInWithEmailLink error', e);
    const code = e && e.code ? e.code : null;
    if (code === 'auth/invalid-action-code') {
      return { success: false, error: code, message: 'This sign-in link is invalid or has already been used.' };
    }
    return { success: false, error: code || String(e), message: e.message || String(e) };
  }
}

export async function signInWithGoogle() {
  const provider = new GoogleAuthProvider();
  try {
    const result = await signInWithPopup(auth, provider);
    const user = result.user;
    // Obtain token and persist similar to email-link flow
    let idToken = null;
    try { idToken = await user.getIdToken(); } catch (e) { /* ignore */ }
    try {
      localStorage.setItem('emailAuth_user', JSON.stringify({ email: user.email, uid: user.uid }));
      localStorage.setItem('emailAuth_loginTime', Date.now().toString());
      if (idToken) {
        localStorage.setItem('emailAuth_token', idToken);
        localStorage.setItem('authToken', idToken);
      }
    } catch (e) {}
    return { success: true, user: { email: user.email, uid: user.uid, token: idToken } };
  } catch (e) {
    // Popup can be blocked or user may close it; fallback to redirect flow which is more robust
    console.warn('signInWithGoogle popup failed, falling back to redirect', e && e.code, e && e.message);
    try {
      // Start redirect-based sign-in
      await signInWithRedirect(auth, provider);
      // The redirect will navigate away; return an object indicating redirect started
      return { success: false, redirect: true, message: 'Redirecting to provider for sign-in' };
    } catch (redirErr) {
      console.error('signInWithGoogle redirect failed', redirErr);
      return { success: false, error: redirErr && redirErr.code ? redirErr.code : null, message: redirErr && redirErr.message ? redirErr.message : String(redirErr) };
    }
  }
}

// Helper to process redirect result after returning from sign-in redirect
export async function handleRedirectResult() {
  try {
    const result = await getRedirectResult(auth);
    if (!result) return { success: false, message: 'No redirect result' };
    const user = result.user;
    let idToken = null;
    try { idToken = await user.getIdToken(); } catch (e) { /* ignore */ }
    try {
      localStorage.setItem('emailAuth_user', JSON.stringify({ email: user.email, uid: user.uid }));
      localStorage.setItem('emailAuth_loginTime', Date.now().toString());
      if (idToken) {
        localStorage.setItem('emailAuth_token', idToken);
        localStorage.setItem('authToken', idToken);
      }
    } catch (e) {}
    return { success: true, user: { email: user.email, uid: user.uid, token: idToken } };
  } catch (e) {
    console.error('handleRedirectResult error', e);
    return { success: false, error: e && e.code ? e.code : null, message: e && e.message ? e.message : String(e) };
  }
}

export function signOut() {
  localStorage.removeItem('emailAuth_user');
  localStorage.removeItem('emailAuth_token');
  localStorage.removeItem('emailAuth_loginTime');
  // Optionally notify backend: POST /auth/signout
  return Promise.resolve();
}

export function onAuthStateChanged(callback) {
  // Simple implementation: call callback with saved user (if any)
  const saved = localStorage.getItem('emailAuth_user');
  const user = saved ? JSON.parse(saved) : null;
  setTimeout(() => callback(user), 50);
  // Return unsubscribe fn (no-op)
  return () => {};
}

export function restoreSession() {
  try {
    const saved = localStorage.getItem('emailAuth_user');
    if (!saved) return null;
    const user = JSON.parse(saved);
    return user;
  } catch (e) { return null; }
}

export async function getIdToken(forceRefresh = false) {
  try {
    const user = auth.currentUser;
    if (!user) return null;
    const token = await firebaseGetIdToken(user, forceRefresh);
    if (token) {
      localStorage.setItem('emailAuth_token', token);
      localStorage.setItem('authToken', token);
    }
    return token;
  } catch (e) {
    console.warn('getIdToken failed', e);
    return null;
  }
}

export default {
  sendVerificationCode,
  verifyCode,
  signInWithEmail,
  signOut,
  onAuthStateChanged,
  restoreSession
};
