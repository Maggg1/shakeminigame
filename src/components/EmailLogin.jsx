import React, { useState, useEffect } from 'react';
import './EmailLogin.css';
import walrusImg from '../assets/walrusicon.png';
import { sendVerificationCode, verifyCode, signInWithEmail, signInWithGoogle, handleRedirectResult } from '../services/auth';

/**
 * Email login component with verification step
 */
export const EmailLogin = ({ onLoginSuccess }) => {
  const [email, setEmail] = useState('');
  const [verificationCode, setVerificationCode] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [isValid, setIsValid] = useState(false);
  const [step, setStep] = useState('email'); // 'email' or 'verification'
  const [codeSent, setCodeSent] = useState(false);
  const [remainingTime, setRemainingTime] = useState(0);
  const [devCode, setDevCode] = useState('');

  // Timer effect for countdown
  useEffect(() => {
    let timer;
    if (remainingTime > 0) {
      timer = setInterval(() => {
        setRemainingTime((r) => {
          if (r <= 1) {
            clearInterval(timer);
            return 0;
          }
          return r - 1;
        });
      }, 1000);
    }
    return () => clearInterval(timer);
  }, [remainingTime]);

  // On mount, try completing sign-in if page contains Firebase email link
  useEffect(() => {
    (async () => {
      try {
        // Process email-link completion
        const res = await signInWithEmail();
        if (res && res.success) {
          onLoginSuccess(res.user.email);
          return;
        }
      } catch (e) {
        // ignore — user will complete via email link
      }
      try {
        // Process OAuth redirect results (Google redirect fallback)
        const r = await handleRedirectResult();
        if (r && r.success) {
          onLoginSuccess(r.user.email);
        }
      } catch (err) {
        // ignore
      }
    })();
  }, []);

  // Email validation
  const validateEmail = (email) => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  };

  // Handle email form submission
  const handleEmailSubmit = async (e) => {
    e.preventDefault();
    
    // Trim and normalize the email to avoid accidental spaces
    const cleanEmail = (email || '').trim();
    console.log('📨 [EMAIL SUBMIT]', { email: cleanEmail, isValid });

    if (!cleanEmail) {
      setError('Please enter your email address');
      return;
    }

    if (!validateEmail(cleanEmail)) {
      setError('Please enter a valid email address');
      return;
    }

    setIsLoading(true);
    setError('');

    try {
      // use cleaned email for the request
      const result = await sendVerificationCode(cleanEmail);

      if (result.success) {
        // Email sign-in link sent
        setStep('link-sent');
        setCodeSent(true);
        setDevCode(result.devCode || '');
        console.log('✅ Email sign-in link sent', result);
        setEmail(cleanEmail);
      } else {
        console.error('sendVerificationCode failed', result);
        // If Firebase reports operation-not-allowed, show a helpful message with next steps
        if (result.error === 'auth/operation-not-allowed' || (result.message && result.message.includes('Email Link sign-in is not enabled'))) {
          setError(result.message + ' Learn more: https://firebase.google.com/docs/auth/web/email-link-auth');
        } else {
          setError(result.message || result.error || 'Failed to send verification code');
        }
      }
    } catch (error) {
      console.error('❌ Failed to send verification code:', error);
      setError(error.message || String(error) || 'Failed to send verification code. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  // Handle verification code submission
  const handleVerificationSubmit = async (e) => {
    e.preventDefault();
    // Trim OTP code to avoid accidental spaces
    const code = (verificationCode || '').trim();
    if (!code || code.length !== 6) {
      setError('Please enter the 6-digit verification code');
      return;
    }

    setIsLoading(true);
    setError('');

    try {
  const result = await verifyCode(email, code);
      
      if (result.success) {
        console.log('✅ verifyCode result', result);
        // If the verify endpoint already returns user/token, use it
        if (result.user) {
          // persist user locally like signInWithEmail would
          localStorage.setItem('emailAuth_user', JSON.stringify(result.user));
          if (result.token) localStorage.setItem('emailAuth_token', result.token);
          localStorage.setItem('emailAuth_loginTime', Date.now().toString());
          console.log('✅ Verification returned user; logging in', result.user.email);
          onLoginSuccess(result.user.email);
        } else {
          // Otherwise request signin (which may call verify-otp on the backend)
          const authResult = await signInWithEmail(email, code);
          console.log('signInWithEmail result', authResult);
          if (authResult.success) {
            console.log('✅ Email verification and authentication successful');
            onLoginSuccess(authResult.user.email);
          } else {
            setError(authResult.error || authResult.message || 'Authentication failed after verification');
          }
        }
      } else {
        setError(result.message || result.error || 'Verification failed');
      }
    } catch (error) {
      console.error('❌ Verification failed:', error);
      setError(error.message || 'Invalid verification code. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  // Handle email input change
  const handleEmailChange = (e) => {
    const value = e.target.value;
    setEmail(value);
    
    // Validate and update state
    const valid = validateEmail(value);
    setIsValid(valid);
    setError('');
    
    // Debug logging
    console.log('📧 [EMAIL INPUT]', { value, valid });
  };

  // Handle verification code input change
  const handleCodeChange = (e) => {
    const value = e.target.value.replace(/\D/g, ''); // Only allow digits
    if (value.length <= 6) {
      setVerificationCode(value);
      setError('');
    }
  };

  // Handle back to email step
  const handleBackToEmail = () => {
    setStep('email');
    setVerificationCode('');
    setCodeSent(false);
    setError('');
    setRemainingTime(0);
  };

  // Handle resend verification code
  const handleResendCode = async () => {
    if (remainingTime > 0) {
      setError('Please wait before requesting a new code');
      return;
    }

    setIsLoading(true);
    setError('');

    try {
      const result = await sendVerificationCode(email);
      if (result.success) {
        setRemainingTime(300);
        setDevCode(result.devCode || '');
        setError('');
        console.log('✅ New verification code sent', result);
      } else {
        console.error('Resend failed', result);
        setError(result.message || result.error || 'Failed to resend code');
      }
    } catch (error) {
      console.error('Resend error', error);
      setError('Failed to resend code. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="phone-login">
      <div className="login-container">
        {/* Development Mode Banner removed per request */}
        
  <div className="login-header">
          <div className="logo-section">
            <img src={walrusImg} alt="walrus" className="walrus-header-img" />
            <h1 className="app-title">Shake Point</h1>
          </div>
          <p className="login-subtitle">
            {step === 'email' 
              ? 'Enter your email address to get started'
              : step === 'link-sent'
                ? 'Check your email and click the sign-in link to continue'
                : 'Enter the verification code sent to your email'
            }
          </p>
        </div>

        {step === 'email' ? (
          // Email Input Step
          <form className="login-form" onSubmit={handleEmailSubmit}>
            <div className="form-group">
              <div className="input-container">
                <span className="input-icon">📧</span>
                <input
                  type="email"
                  id="email"
                  name="email"
                  value={email}
                  onChange={handleEmailChange}
                  placeholder="Enter your email address"
                  className={`phone-input ${isValid ? 'valid' : ''} ${error ? 'error' : ''}`}
                  disabled={isLoading}
                  autoComplete="email"
                  autoFocus
                />
              </div>
              
              {error && (
                <div className="error-message">
                  <span className="error-icon">⚠️</span>
                  {error}
                </div>
              )}
            </div>

            <button
              type="submit"
              className={`login-btn ${isLoading ? 'loading' : ''} ${isValid ? 'valid' : ''}`}
              disabled={!isValid || isLoading}
            >
              {isLoading ? (
                <>
                  <span className="loading-spinner"></span>
                  Sending Code...
                </>
              ) : (
                <>
                  <span className="btn-icon">�</span>
                  Send Verification Code
                </>
              )}
            </button>

            <div style={{ textAlign: 'center', marginTop: 12 }}>
              <button type="button" className="google-btn" onClick={async () => {
                setIsLoading(true);
                setError('');
                try {
                  const res = await signInWithGoogle();
                  if (res && res.success) {
                    onLoginSuccess(res.user.email);
                  } else {
                    setError(res.message || res.error || 'Google sign-in failed');
                  }
                } catch (e) {
                  console.error('Google sign-in error', e);
                  setError('Google sign-in failed');
                } finally {
                  setIsLoading(false);
                }
              }}>
                Sign in with Google
              </button>
            </div>

            <div className="form-footer">
              <p className="privacy-text">
                We'll send a sign-in link to your email address.
              </p>
            </div>
          </form>
        ) : step === 'link-sent' ? (
          <div className="login-form link-sent">
            <p>A sign-in link was sent to <strong>{email}</strong>. Check your inbox (and spam) and click the link to finish signing in.</p>
            <div className="form-actions">
              <button
                type="button"
                className="resend-btn"
                onClick={handleResendCode}
                disabled={isLoading || remainingTime > 0}
              >
                <span className="resend-icon">🔄</span>
                {remainingTime > 0 ? `Resend (${remainingTime}s)` : 'Resend Link'}
              </button>
            </div>
          </div>
        ) : (
          // Verification Code Step (legacy/backwards compatibility)
          <form className="login-form" onSubmit={handleVerificationSubmit}>
            <div className="form-group">
              <div className="verification-info">
                <p className="verification-text">
                  We sent a 6-digit code to <strong>{email}</strong>
                </p>
                {remainingTime > 0 && (
                  <p className="timer-text">
                    Code expires in: <span className="timer">{Math.floor(remainingTime / 60)}:{(remainingTime % 60).toString().padStart(2, '0')}</span>
                  </p>
                )}
              </div>

              <div className="input-container">
                <span className="input-icon">🔢</span>
                <input
                  type="text"
                  id="verificationCode"
                  name="verificationCode"
                  value={verificationCode}
                  onChange={handleCodeChange}
                  placeholder="Enter 6-digit code"
                  className={`phone-input otp-input ${verificationCode.length === 6 ? 'valid' : ''} ${error ? 'error' : ''}`}
                  disabled={isLoading}
                  maxLength="6"
                  autoComplete="one-time-code"
                  autoFocus
                />
              </div>

              {error && (
                <div className="error-message">
                  <span className="error-icon">⚠️</span>
                  {error}
                </div>
              )}
            </div>

            <button
              type="submit"
              className={`login-btn ${isLoading ? 'loading' : ''} ${verificationCode.length === 6 ? 'valid' : ''}`}
              disabled={verificationCode.length !== 6 || isLoading}
            >
              {isLoading ? (
                <>
                  <span className="loading-spinner"></span>
                  Verifying...
                </>
              ) : (
                <>
                  <span className="btn-icon">✅</span>
                  Verify & Sign In
                </>
              )}
            </button>

            <div className="form-actions">
              <button
                type="button"
                className="back-btn"
                onClick={handleBackToEmail}
                disabled={isLoading}
              >
                <span className="back-icon">⬅️</span>
                Back to Email
              </button>

              <button
                type="button"
                className="resend-btn"
                onClick={handleResendCode}
                disabled={isLoading || remainingTime > 0}
              >
                <span className="resend-icon">🔄</span>
                {remainingTime > 0 ? `Resend (${remainingTime}s)` : 'Resend Code'}
              </button>
            </div>

            <div className="form-footer">
              <p className="privacy-text">
                Didn't receive the code? Check your spam folder or try resending.
              </p>
            </div>
          </form>
        )}

        {/* Hidden reCAPTCHA container (not needed for email auth) */}
        <div id="recaptcha-container" style={{ display: 'none' }}></div>
      </div>
    </div>
  );
};