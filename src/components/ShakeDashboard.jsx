import React, { useState, useEffect } from 'react';
import ReactDOM from 'react-dom';
import './ShakeDashboard.css';
import { API } from '../config/api';
import { useAuth } from '../hooks/useAuth';
import { PointsSystem } from '../utils/pointsSystem';
import { useRef } from 'react';
import { getIdToken } from '../services/auth';
import fetchAuth from '../utils/fetchAuth';
import { getAuth } from 'firebase/auth';
import gameApi from '../services/game-api';
import RewardModal from './RewardModal';

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
  const [rewardDefs, setRewardDefs] = useState([]);
  const [showRewardModal, setShowRewardModal] = useState(false);
  const [lastRedemption, setLastRedemption] = useState(null);
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

  // When a claim happens we persist a short-lived local result object to localStorage
  // so other pages (or navigation back) can show the deducted balance immediately
  // without being overwritten by a stale server response. This is the grace window.
  const CLAIM_GRACE_MS = 10000; // 10s

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
        // Use centralized fetchAuth which will attach Authorization and retry on 401
        result = await fetchAuth(url, { method: 'GET' }, 7000);
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
        if (actions && actions.length) {
          // Normalize actions into { id, type, reward, timestamp, details }
          const normalized = actions.map(act => {
            const details = act || {};
            const redemption = details.redemption || details.claim || details.redem || details.redemp || null;
            const rewardDef = (redemption && redemption.rewardDef) || details.rewardDef || null;
            const rewardTitle = details.reward || (rewardDef && (rewardDef.title || rewardDef.name)) || redemption && (redemption.title || redemption.name) || details.title || details.action || details.type || '';
            const cost = (redemption && (redemption.cost ?? redemption.points)) || details.pointsClaimed || details.cost || null;
            return {
              id: details.id || details._id || details.claimId || `act-${Math.random().toString(36).slice(2,9)}`,
              type: details.type || details.action || (redemption ? 'claim' : 'activity'),
              reward: rewardTitle,
              timestamp: details.timestamp || details.time || details.createdAt || details.ts || Date.now(),
              details
            };
          }).slice(0,20);
          setRecentActivity(normalized);
        }
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
    // If a recent claim was just made, prefer that local result for a short grace window
    // so a stale server fetch doesn't immediately overwrite the deducted balance.
    const tryConsumeLocalClaim = () => {
      try {
        const raw = localStorage.getItem('lastClaimResult');
        if (!raw) return false;
        const parsed = JSON.parse(raw);
        if (!parsed) return false;
        // Accept the local claim if it matches the current user and is reasonably recent (2 minutes)
        if (parsed.email === userIdentifier && (Date.now() - (parsed.timestamp || 0) < 2 * 60 * 1000)) {
          // Apply the locally computed availablePoints immediately
          setAvailablePoints(Number(parsed.availablePoints) || 0);
          // Prepend to recent activity for visibility
          try {
            const rewardTitle = (parsed.redemption && (parsed.redemption.rewardDef && (parsed.redemption.rewardDef.title || parsed.redemption.rewardDef.name))) || parsed.reward || parsed.rewardName || '';
            const claimEntry = {
              id: `claim-local-${Date.now()}`,
              type: 'claim',
              reward: rewardTitle || '',
              timestamp: new Date().toISOString(),
              details: parsed
            };
            setRecentActivity(prev => [claimEntry].concat(prev || []).slice(0, 20));
          } catch (e) {}
          // Consume the storage key so it doesn't reapply on the next mount
          try { localStorage.removeItem('lastClaimResult'); } catch (e) {}
          return true;
        }
      } catch (e) {}
      return false;
    };

    const consumed = tryConsumeLocalClaim();

    if (consumed) {
      // If we used the local claim, stop polling briefly and schedule a refresh after the grace window
      setStopPolling(true);
      const t = setTimeout(() => {
        setStopPolling(false);
        // fetch authoritative state after the grace period
        (async () => { try { await fetchUserPoints(); } catch (e) {} })();
      }, CLAIM_GRACE_MS);
      // load reward definitions in parallel
      (async () => {
        try {
          const defs = await gameApi.getRewardDefinitions();
          setRewardDefs(defs && defs.rewards ? defs.rewards : (defs || []));
        } catch (e) { /* ignore */ }
      })();
      const interval = setInterval(() => {
        if (!stopPolling) fetchUserPoints();
      }, 5000);
      return () => { clearInterval(interval); clearTimeout(t); };
    }

    // No recent local claim to consume — proceed normally
    setStopPolling(false);
    fetchUserPoints();
    // load reward definitions for help modal and display
    (async () => {
      try {
        const defs = await gameApi.getRewardDefinitions();
        setRewardDefs(defs && defs.rewards ? defs.rewards : (defs || []));
      } catch (e) { /* ignore */ }
    })();
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
          const result = ev && ev.detail && ev.detail.result;
          if (result) {
            // Use provided result payload to update UI immediately (prefer event data over refetch)
            try {
              const avail = result.availablePoints ?? result.available ?? result.unclaimed ?? result.points;
              const total = result.newTotalPoints ?? result.totalPoints ?? result.total ?? result.points;
              if (typeof avail !== 'undefined') setAvailablePoints(Number(avail) || 0);
              if (typeof total !== 'undefined') setTotalPoints(Number(total) || 0);
            } catch (e) {}

            // If event contains result data (claim), add to recentActivity for immediate visibility
            try {
              const rewardTitle = (result.redemption && (result.redemption.rewardDef && (result.redemption.rewardDef.title || result.redemption.rewardDef.name))) || result.reward || result.rewardName || '';
              const claimEntry = {
                id: `claim-${Date.now()}`,
                type: 'claim',
                reward: rewardTitle || (result.redemption && result.redemption.tier) || '',
                timestamp: new Date().toISOString(),
                details: result
              };
              setRecentActivity(prev => [claimEntry].concat(prev || []).slice(0, 20));
            } catch (e) {}
            // don't re-fetch immediately; the UI is now consistent with the event
            return;
          }

          // No result payload — fall back to fetching authoritative state from server
          fetchUserPoints();
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

      // Use gameApi.shake which attaches Authorization
      let data = null;
      try {
        data = await gameApi.shake(userIdentifier, { pointsToClaim });
      } catch (networkErr) {
        console.error('[ShakeDashboard] Network error during claim:', networkErr);
        alert('❌ Network error claiming points. Try again later.');
        setIsShaking(false);
        return;
      }

      // Do NOT trust old local fields. Use redemption to display claim details and then refresh totals from server.
      try {
        // If redemption provided, persist and notify other tabs/components
        if (data && data.redemption) {
          const r = data.redemption;
          const title = (r.rewardDef && r.rewardDef.title) || (r.claim && r.claim.title) || '';
          const tier = r.tier || '';
          const cost = r.cost != null ? r.cost : null;
          const lastClaim = {
            email: userIdentifier,
            redemption: r,
            pointsClaimed: r.cost != null ? r.cost : (data.pointsClaimed || 0),
            availablePoints: data.availablePoints || data.available || 0,
            newTotalPoints: data.newTotalPoints || data.points || null,
            timestamp: Date.now(),
            raw: data
          };
          try { localStorage.setItem('lastClaimResult', JSON.stringify(lastClaim)); } catch (e) {}
          try { window.dispatchEvent(new CustomEvent('pointsUpdated', { detail: { email: userIdentifier, result: data, popupShown: true } })); } catch (e) {}

          // Show the modal inside the app using redemption info
          setTimeout(() => {
            setIsShaking(false);
            setLastRedemption(r);
            setShowRewardModal(true);
          }, 200);
        }
      } catch (e) {
        console.warn('[ShakeDashboard] Error handling redemption display', e);
      } finally {
        // Refresh authoritative state from server so totals match backend
        try { await fetchUserPoints(); } catch (e) { /* ignore */ }
      }
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
            <h3>How To Play</h3>
            <button className="help-close" onClick={() => setHelpOpen(false)}>✕</button>
          </div>
          <div className="help-body">
            <p>Shaking now redeems rewards based on your available points and admin-defined reward rules.</p>
            <ul>
              <li>Admins manage reward definitions on the backend — the app will show and prefer those when available.</li>
              <li>Available points are added by admins. Shake or tap to redeem a reward that fits your available points.</li>
              <li>If the server returns a redemption and updated balances, the app will use those authoritative values. Otherwise the client chooses the best-fit reward and decrements points locally for immediate feedback.</li>
            </ul>
            <h4>Rewards available</h4>
            <div className="help-rewards">
              {rewardDefs && rewardDefs.length > 0 ? (
                rewardDefs.map((r, i) => (
                  <div className="help-reward-item" key={r.id || r.tier || r._id || i}>
                    <div className="help-reward-points">{r.pointsRequired ?? r.cost ?? r.points ?? '—'} pts</div>
                    <div className="help-reward-name">{r.title || r.name || r.label || r.reward}</div>
                    {r.description && <div className="help-reward-desc">{r.description}</div>}
                  </div>
                ))
              ) : (
                <div>No rewards configured by admin.</div>
              )}
            </div>
            <p className="help-note">Tip: Ensure your admin has defined rewards on the backend to control what users can redeem.</p>
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

      {/* Daily Summary removed per request */}

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
                {recentActivity.map((a, idx) => {
                  // Prefer explicit reward title fields; fall back to redemption payload shapes
                  const details = a.details || a.raw || null;
                  const redemption = details && (details.redemption || details.redem || details.claim) ? (details.redemption || details.redem || details.claim) : null;
                  const rewardDef = redemption && redemption.rewardDef ? redemption.rewardDef : null;
                  const rewardTitle = a.reward || (rewardDef && (rewardDef.title || rewardDef.name)) || redemption && (redemption.title || redemption.name) || a.type || '';
                  const cost = redemption && (redemption.cost ?? redemption.points ?? (rewardDef && (rewardDef.pointsRequired ?? rewardDef.cost))) || (details && (details.pointsClaimed || details.cost)) || null;
                  const timeLabel = new Date(a.timestamp || a.time || Date.now()).toLocaleString();
                  return (
                    <div className="history-item" key={a.id || idx}>
                      <div className="history-info">
                        <div className="shake-number">{rewardTitle}</div>
                        <div className="shake-time">{timeLabel}</div>
                      </div>
                      <div className="history-reward">
                        <div className="reward-amount">{rewardTitle}</div>
                        <div className="trade-details">{cost ? `${cost} pts` : ''}</div>
                      </div>
                    </div>
                  );
                })}
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
      <RewardModal open={showRewardModal} onClose={() => setShowRewardModal(false)} redemption={lastRedemption} />
    </div>
  );
};