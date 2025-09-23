import { auth } from '../firebase/config';
import { sendSignInLinkToEmail, isSignInWithEmailLink, signInWithEmailLink } from 'firebase/auth';

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
      localStorage.setItem('emailAuth_user', JSON.stringify({ email: user.email, uid: user.uid }));
      localStorage.setItem('emailAuth_loginTime', Date.now().toString());
      return { success: true, user: { email: user.email, uid: user.uid } };
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

export default {
  sendVerificationCode,
  verifyCode,
  signInWithEmail,
  signOut,
  onAuthStateChanged,
  restoreSession
};
