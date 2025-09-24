import React, { useState, useEffect } from 'react';
import ReactDOM from 'react-dom';
import './ShakeDashboard.css';
import { API } from '../config/api';
import { useAuth } from '../hooks/useAuth';
import { PointsSystem } from '../utils/pointsSystem';
import { useRef } from 'react';
import { getIdToken } from '../services/auth';
import { getAuth } from 'firebase/auth';

export const ShakeDashboard = ({ phoneNumber }) => {
  const auth = useAuth();
  const userIdentifier = auth?.email || phoneNumber;

  const [availablePoints, setAvailablePoints] = useState(0);
  const [totalPoints, setTotalPoints] = useState(0);
  const [isShaking, setIsShaking] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [lastFetchStatus, setLastFetchStatus] = useState(null);
  const [lastFetchRaw, setLastFetchRaw] = useState(null);
  const [recentActivity, setRecentActivity] = useState([]);
  const [claimAmount, setClaimAmount] = useState('all');
  const [helpOpen, setHelpOpen] = useState(false);
  const [stopPolling, setStopPolling] = useState(false);
  const psRef = useRef(null);
  const tokenRef = useRef(localStorage.getItem('emailAuth_token'));

  // Poll localStorage for token changes (works in the same tab where storage events don't fire)
  useEffect(() => {
    let mounted = true;
    const interval = setInterval(() => {
      try {
        const current = localStorage.getItem('emailAuth_token');
        if (current !== tokenRef.current) {
          tokenRef.current = current;
          // reset polling and refresh points when token changes
          setStopPolling(false);
          (async () => { try { await fetchUserPoints(); } catch(e){} })();
        }
      } catch (e) {}
    }, 700);
    return () => { mounted = false; clearInterval(interval); };
  }, []);

  // Robust API base: prefer imported API, then window.BACKEND_URL, then REACT_APP_API_URL, then default localhost:3001
  const ADMIN_API_BASE = (() => {
    try {
      if (API) return String(API).replace(/\/$/, '');
    } catch (e) {}
    if (typeof window !== 'undefined' && window.BACKEND_URL) return String(window.BACKEND_URL).replace(/\/$/, '');
    // CRA will replace process.env.REACT_APP_API_URL at build time if set
    if (typeof process !== 'undefined' && process.env && process.env.REACT_APP_API_URL) return String(process.env.REACT_APP_API_URL).replace(/\/$/, '');
    // if hosted on github pages and backend is same origin, use origin
    if (typeof window !== 'undefined' && window.location && window.location.origin && window.location.origin.indexOf('github.io') !== -1) return window.location.origin;
    return 'http://localhost:3001';
  })();

  // short helper to do fetch with timeout and return { ok, status, bodyText, json? }
  const fetchWithTimeout = async (url, opts = {}, timeoutMs = 7000) => {
    const controller = new AbortController();
    const signal = controller.signal;
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      // default to sending cookies (session-based auth)
      const res = await fetch(url, { signal, credentials: opts.credentials ?? 'include', ...opts });
      const text = await res.text().catch(() => '');
      let json = null;
      try { json = text ? JSON.parse(text) : null; } catch (e) { /* ignore parse error */ }
      return { ok: res.ok, status: res.status, statusText: res.statusText, bodyText: text, json };
    } catch (err) {
      // If aborted, err.name === 'AbortError'
      throw err;
    } finally {
      clearTimeout(timer);
    }
  };

  const rewardLadder = [
    { points: 1, reward: "RM1 Credit" },
    { points: 10, reward: "RM5 Voucher" },
    { points: 25, reward: "RM15 Voucher" },
    { points: 50, reward: "RM40 Voucher" },
    { points: 100, reward: "Physical Plushie" }
  ];

  const fetchUserPoints = async () => {
    try {
      setIsLoading(true);

      if (!userIdentifier) {
        console.warn('[ShakeDashboard] No user identifier provided — skipping fetch');
        setLastFetchStatus('no-identifier');
        setLastFetchRaw(null);
        setAvailablePoints(0);
        setTotalPoints(0);
        setIsLoading(false);
        return;
      }

      const encodedUser = encodeURIComponent(userIdentifier);
      const url = `${ADMIN_API_BASE.replace(/\/$/, '')}/rewards?email=${encodedUser}&_=${Date.now()}`;
      console.debug('[ShakeDashboard] fetching rewards from', url);

      let result;
      try {
        // Obtain Firebase ID token from the current user and include in Authorization header
        let token = null;
        try {
          const authInst = getAuth();
          const user = authInst.currentUser;
          if (user) token = await user.getIdToken(/* forceRefresh= */ false);
        } catch (e) {
          token = null;
        }
        if (!token) token = localStorage.getItem('authToken') || localStorage.getItem('emailAuth_token');
        const headers = token ? { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' } : { 'Content-Type': 'application/json' };
        result = await fetchWithTimeout(url, { method: 'GET', headers, credentials: 'include' }, 7000);
      } catch (networkErr) {
        // Distinguish timeout/abort from other network failures
        if (networkErr && networkErr.name === 'AbortError') {
          console.warn('[ShakeDashboard] Fetch aborted (timeout):', networkErr);
          setLastFetchStatus('timeout');
          setLastFetchRaw(String(networkErr));
          setAvailablePoints(0);
          setTotalPoints(0);
          // fallback to local PointsSystem if available
          try {
            if (!psRef.current && userIdentifier) psRef.current = new PointsSystem(userIdentifier);
            if (psRef.current) {
              psRef.current.loadData();
              setAvailablePoints(psRef.current.availablePoints || 0);
              setTotalPoints(psRef.current.totalPoints || 0);
            }
          } catch(e){}
          return;
        }
        console.error('[ShakeDashboard] Network error fetching rewards:', networkErr);
        setLastFetchStatus('network-error');
        setLastFetchRaw(String(networkErr));
        setAvailablePoints(0);
        setTotalPoints(0);
        return;
      }

      // Map 401 -> 'unauthorized' for UI clarity
      if (result.status === 401) {
        console.warn('[ShakeDashboard] Unauthorized when fetching rewards:', result.bodyText || result.statusText);

        // Try refreshing token once and retry with refreshed token (JWT strategy)
        try {
          const newToken = await getIdToken(true);
          if (newToken) {
            console.debug('[ShakeDashboard] Obtained refreshed token, retrying request');
            const retryHeaders = { 'Authorization': `Bearer ${newToken}`, 'Content-Type': 'application/json' };
            let retryResult = null;
            try {
              retryResult = await fetchWithTimeout(url, { method: 'GET', headers: retryHeaders, credentials: 'include' }, 7000);
            } catch (retryErr) {
              console.error('[ShakeDashboard] Retry network error:', retryErr);
            }
            if (retryResult && retryResult.ok) {
              result = retryResult;
            } else {
              console.warn('[ShakeDashboard] Retry failed or not OK, falling back to local points');
            }
          }
        } catch (refreshErr) {
          console.warn('[ShakeDashboard] Token refresh failed', refreshErr);
        }

        // If after retry result is still unauthorized or not ok, fallback to local points
        if (result.status === 401 || !result.ok) {
          setLastFetchStatus('unauthorized');
          setLastFetchRaw(result.bodyText || JSON.stringify(result.json || {}, null, 2));
          setAvailablePoints(0);
          setTotalPoints(0);
          try {
            if (!psRef.current && userIdentifier) psRef.current = new PointsSystem(userIdentifier);
            if (psRef.current) {
              psRef.current.loadData();
              setAvailablePoints(psRef.current.availablePoints || 0);
              setTotalPoints(psRef.current.totalPoints || 0);
            }
          } catch (e) {
            // ignore
          }
          setStopPolling(true);
          return;
        }
      }
      setLastFetchStatus(result.status);
      setLastFetchRaw(result.bodyText || JSON.stringify(result.json || {} , null, 2) || null);

      if (!result.ok) {
        console.warn('[ShakeDashboard] Non-OK response fetching rewards:', result.status, result.statusText, result.bodyText);
        setAvailablePoints(0);
        setTotalPoints(0);
        return;
      }

      const data = result.json ?? (result.bodyText ? (() => { try { return JSON.parse(result.bodyText); } catch(e){ return null; } })() : null) ?? {};
      // tolerate multiple shapes
      const available = data.availablePoints ?? data.available ?? data.unclaimed ?? data.points ?? (data.user && (data.user.availablePoints ?? data.user.available ?? data.user.points)) ?? 0;
      const total = data.totalPoints ?? data.total ?? (data.user && (data.user.totalPoints ?? data.user.total)) ?? (data.points ? Number(data.points) : 0);

      setAvailablePoints(Number(available) || 0);
      setTotalPoints(Number(total) || 0);
      // Extract recent activity if present
      try {
        const actions = data.user && Array.isArray(data.user.actions) ? data.user.actions.slice(0, 20) : (data.actions && Array.isArray(data.actions) ? data.actions.slice(0,20) : []);
        if (actions && actions.length) setRecentActivity(actions);
      } catch (e) {}
      setLastUpdated(new Date());
    } catch (error) {
      console.error('[ShakeDashboard] Error fetching points:', error);
      setAvailablePoints(0);
      setTotalPoints(0);
      setLastFetchStatus('error');
      setLastFetchRaw(String(error));
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    // Reset polling state when user changes
    setStopPolling(false);
    fetchUserPoints();
    const interval = setInterval(() => {
      if (!stopPolling) fetchUserPoints();
    }, 5000);
    // Listen for cross-page updates when a claim occurs
    const onPointsUpdated = (ev) => {
      try {
        const detailEmail = ev && ev.detail && ev.detail.email;
        // Only refresh if the event matches current user (or if no detail provided)
        if (!detailEmail || detailEmail === userIdentifier) {
          setStopPolling(false);
          fetchUserPoints();
          // If event contains result data (claim), add to recentActivity for immediate visibility
          try {
            const result = ev && ev.detail && ev.detail.result;
            if (result) {
              const claimEntry = {
                id: `claim-${Date.now()}`,
                type: 'claim',
                points: result.pointsClaimed || 0,
                timestamp: new Date().toISOString(),
                details: result
              };
              setRecentActivity(prev => [claimEntry].concat(prev || []).slice(0, 20));
            }
          } catch(e) {}
        }
      } catch (e) {}
    };
    window.addEventListener('pointsUpdated', onPointsUpdated);
    return () => {
      clearInterval(interval);
      try { window.removeEventListener('pointsUpdated', onPointsUpdated); } catch (e) {}
    };
  }, [userIdentifier]);

  const renderStatusBanner = () => {
    if (lastFetchStatus === 'no-identifier') {
      return (<div className="shake-section" style={{ marginBottom: 12, borderLeft: '4px solid #f59e0b' }}>
        <p style={{ margin: 0 }}>⚠️ No user email available — sign in to view your points.</p>
      </div>);
    }
    if (lastFetchStatus === 'network-error') {
      return (<div className="shake-section" style={{ marginBottom: 12, borderLeft: '4px solid #ef4444' }}>
        <p style={{ margin: 0 }}>❌ Network error — could not reach the admin API. Points are shown from local cache.</p>
      </div>);
    }
    if (lastFetchStatus === 'timeout') {
      return (<div className="shake-section" style={{ marginBottom: 12, borderLeft: '4px solid #f43f5e' }}>
        <p style={{ margin: 0 }}>⏱️ Request timed out — the admin API is slow or unreachable.</p>
      </div>);
    }
    if (lastFetchStatus === 'unauthorized') {
      return (<div className="shake-section" style={{ marginBottom: 12, borderLeft: '4px solid #ef4444' }}>
        <p style={{ margin: 0 }}>🔒 Unauthorized — the admin API requires authorization. Sign in or provide valid credentials.</p>
      </div>);
    }
    return null;
  };

  const mapReward = (p) => {
    const n = Number(p) || 0;
    if (n > 0 && n < 5) return 'RM3 voucher';
    if (n < 10) return 'RM6 voucher';
    if (n < 20) return 'RM8 credit';
    if (n < 30) return 'RM13 credit';
    if (n < 40) return 'Keychain';
    if (n < 50) return 'Plushie';
    return 'Special prize';
  };

  const getTodaysEarned = () => {
    try {
      if (!lastFetchRaw) return 0;
      const data = typeof lastFetchRaw === 'string' ? (function(){ try { return JSON.parse(lastFetchRaw); } catch(e){ return null; } })() : lastFetchRaw;
      if (!data) return 0;
      if (typeof data.todayEarned === 'number') return data.todayEarned;
      if (data.today && typeof data.today.earned === 'number') return data.today.earned;
      if (data.user && Array.isArray(data.user.actions)) {
        const today = new Date();
        const start = new Date(today.getFullYear(), today.getMonth(), today.getDate());
        let sum = 0;
        data.user.actions.forEach(a => {
          const t = new Date(a.timestamp || a.time || a.ts);
          if (!isNaN(t) && t >= start) sum += Number(a.points || a.delta || 0);
        });
        return sum;
      }
      return 0;
    } catch (e) { return 0; }
  };

  const handleShake = async (pointsToClaimOverride) => {
    if (availablePoints === 0) {
      alert('No points to claim! Points are added by admins.');
      return;
    }

    setIsShaking(true);
    if (navigator.vibrate) navigator.vibrate([100, 30, 100]);

    try {
      const pointsToClaim = typeof pointsToClaimOverride === 'number'
        ? pointsToClaimOverride
        : (claimAmount === 'all' ? availablePoints : Number(claimAmount));

      const url = `${ADMIN_API_BASE.replace(/\/$/, '')}/shake`;
      const body = { email: userIdentifier, pointsToClaim };

      let result;
        try {
        // Prefer using Firebase current user's ID token for the POST
        let postToken = null;
        try {
          const authInst = getAuth();
          const user = authInst.currentUser;
          if (user) postToken = await user.getIdToken(/* forceRefresh= */ false);
        } catch (e) { postToken = null; }
        if (!postToken) postToken = localStorage.getItem('authToken') || localStorage.getItem('emailAuth_token');
        const postHeaders = postToken ? { 'Content-Type': 'application/json', 'Authorization': `Bearer ${postToken}` } : { 'Content-Type': 'application/json' };
        result = await fetchWithTimeout(url, {
          method: 'POST',
          headers: postHeaders,
          body: JSON.stringify(body),
          credentials: 'include'
        }, 7000);
      } catch (networkErr) {
        console.error('[ShakeDashboard] Network error during claim:', networkErr);
        alert('❌ Network error claiming points. Try again later.');
        setIsShaking(false);
        return;
      }

      if (!result.ok) {
        console.error('[ShakeDashboard] Claim failed:', result.status, result.bodyText);
        alert(`❌ Failed to claim points: ${result.status} ${result.statusText}`);
        setIsShaking(false);
        return;
      }

      const data = result.json ?? (result.bodyText ? JSON.parse(result.bodyText) : {});
      setTotalPoints(data.newTotalPoints || totalPoints + (data.pointsClaimed || 0));
      setAvailablePoints(data.availablePoints || 0);
      setLastUpdated(new Date());

      setTimeout(() => {
        setIsShaking(false);
        const reward = mapReward(data.pointsClaimed);
        alert(`🎉 Points Claimed!\n💰 +${data.pointsClaimed} points\n📦 Reward: ${reward}\n📊 Total: ${data.newTotalPoints} points`);
      }, 1500);
    } catch (error) {
      console.error('Error claiming points:', error);
      setIsShaking(false);
      alert('❌ Failed to claim points. Please try again.');
    }
  };

  const nextReward = rewardLadder.find(r => totalPoints < r.points);
  const progressToNext = nextReward ? ((totalPoints / nextReward.points) * 100) : 100;
  const pointsNeeded = nextReward ? (nextReward.points - totalPoints) : 0;

  const helpModalMarkup = (
    helpOpen ? (
      <div className="help-modal-overlay" onClick={() => setHelpOpen(false)}>
        <div className="help-modal" onClick={(e) => e.stopPropagation()}>
          <div className="help-header">
            <h3>How To Play & Rewards</h3>
            <button className="help-close" onClick={() => setHelpOpen(false)}>✕</button>
          </div>
          <div className="help-body">
            <p>Welcome! Here's how the points and rewards work:</p>
            <ul>
              <li>Admins add points to your account (via +1/+2 or admin dashboard).</li>
              <li>Available points are unclaimed points you can claim by tapping or shaking.</li>
              <li>Use the Claim button or tap the phone to convert available points into total points.</li>
            </ul>
            <h4>Reward Table</h4>
            <div className="help-rewards">
              {rewardLadder.map((r, i) => (
                <div className="help-reward-item" key={i}>
                  <div className="help-reward-points">{r.points} pts</div>
                  <div className="help-reward-name">{r.reward}</div>
                  <div className="help-reward-unlocked">{totalPoints >= r.points ? '✅ Unlocked' : '🔒 Locked'}</div>
                </div>
              ))}
            </div>
            <p className="help-note">Tip: Claim smaller amounts to get more frequent rewards.</p>
          </div>
        </div>
      </div>
    ) : null
  );

  return (
    <div className="shake-dashboard">
      {/* Points Stats Card */}
      <div className="stats-card">
        <div className="stats-grid">
          <div className="stat-item">
            <div className="stat-label">Available Points</div>
            <div className="stat-value points-available">
              {isLoading ? '...' : availablePoints}
            </div>
            <div className="stat-hint">Ready to claim</div>
          </div>
          <div className="stat-item">
            <div className="stat-label">Total Points</div>
            <div className="stat-value points-total">
              {isLoading ? '...' : totalPoints}
            </div>
            <div className="stat-hint">Lifetime earned</div>
          </div>
          <div className="stat-item">
            <div className="stat-label">Next Reward</div>
            <div className="stat-value">
              {nextReward ? `${nextReward.points} pts` : 'Max Level!'}
            </div>
            <div className="progress-bar">
              <div
                className="progress-fill"
                style={{ width: `${progressToNext}%` }}
              />
            </div>
          </div>
        </div>
        {lastUpdated && (
          <div className="last-updated">
            Last updated: {lastUpdated.toLocaleTimeString()}
          </div>
        )}
        <div className="manual-refresh">
          <button className="refresh-btn" onClick={() => { setStopPolling(false); fetchUserPoints(); }}>Refresh</button>
        </div>
      </div>

      {/* Daily Summary (replaces Reward Ladder) */}
      <div className="daily-summary">
        <h3>⚡ Daily Summary</h3>
        <div className="daily-grid">
          <div className="coin-card">
            <div className="coin">🪙</div>
            <div className="coin-info">
              <div className="coin-value">{getTodaysEarned()} pts</div>
              <div className="coin-label">Today's Earned</div>
            </div>
          </div>

          <div className="meter-card">
            <div className="meter-label">Shake Power</div>
            <div className="meter-bar">
              <div className="meter-fill" style={{ width: `${Math.min(100, (availablePoints / Math.max(1, 10)) * 100)}%` }} />
            </div>
            <div className="meter-hint">{availablePoints} available • {totalPoints} total</div>
          </div>
        </div>
      </div>

      <div className="shake-cta">
        <div className="shake-cta-card">
          <h3>📱 Shake or Tap</h3>
          <p>Open the dedicated shake page to use device motion and claim available points.</p>
          <div style={{ textAlign: 'center', marginTop: 8 }}>
            <a href="#/shake" className="open-shake-page">Open Shake Page</a>
          </div>
        </div>
      </div>

      <div className="history-section">
        <h3>📊 Recent Activity</h3>
        <div className="activity-info">
          <div className="activity-card">
            <span className="activity-icon">⏱️</span>
            <div className="activity-content">
              <h4>Real-Time Activity</h4>
              <p>Activity tracking will be connected to the admin system.</p>
              <p>Point additions and claims will appear here automatically.</p>
            </div>
          </div>
        </div>

          <div className="activity-placeholder">
            {recentActivity && recentActivity.length > 0 ? (
              <div className="history-list">
                {recentActivity.map((a, idx) => (
                  <div className="history-item" key={a.id || idx}>
                    <div className="history-info">
                      <div className="shake-number">{a.points ?? a.delta ?? ''} pts</div>
                      <div className="shake-time">{new Date(a.timestamp || a.time || Date.now()).toLocaleString()}</div>
                    </div>
                    <div className="history-reward">
                      <div className="reward-amount">{a.type || a.action || 'action'}</div>
                      <div className="trade-details">{a.details ? (a.details.pair || a.details.content || JSON.stringify(a.details)) : (a.reason || '')}</div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <>
                <p>🔄 Activity data will be loaded from admin backend...</p>
                <p>Check the <a href={ADMIN_API_BASE} target="_blank" rel="noopener noreferrer">Admin Dashboard</a> to manage points.</p>
              </>
            )}
          </div>
      </div>

      {typeof document !== 'undefined' ? ReactDOM.createPortal(
        <>
          <button className="help-fab" title="Help & Rewards" onClick={() => setHelpOpen(true)}>?</button>
          {helpModalMarkup}
        </>,
        document.body
      ) : (
        <>
          <button className="help-fab" title="Help & Rewards" onClick={() => setHelpOpen(true)}>?</button>
          {helpModalMarkup}
        </>
      )}
    </div>
  );
};