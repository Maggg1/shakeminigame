import React, { useEffect, useState, useRef } from 'react';
import '../components/ShakeDashboard.css';
import { API } from '../config/api';
import { useAuth } from '../hooks/useAuth';
import { useNavigate } from 'react-router-dom';
import { getAuth } from 'firebase/auth';
import { PointsSystem } from '../utils/pointsSystem';
import fetchAuth from '../utils/fetchAuth';
import gameApi from '../services/game-api';
import RewardModal from '../components/RewardModal';

const SHAKE_THRESHOLD = 15; // Acceleration threshold

export default function ShakePage() {
  const { email } = useAuth();
  const navigate = useNavigate();
  const [isShaking, setIsShaking] = useState(false);
  const [availablePoints, setAvailablePoints] = useState(0);
  const [rewardDefs, setRewardDefs] = useState([]);
  const [lastRedemption, setLastRedemption] = useState(null);
  const [showRewardModal, setShowRewardModal] = useState(false);
  const [toast, setToast] = useState({ visible: false, title: '', body: '' });
  const lastAccel = useRef({ x: null, y: null, z: null });

  // On mount, consume any recent claim result saved by the claim flow
  useEffect(() => {
    try {
      const raw = localStorage.getItem('lastClaimResult');
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (!parsed) return;
      // Only show if it matches this user and is recent (2 minutes)
      if (parsed.email === email && (Date.now() - (parsed.timestamp || 0) < 2 * 60 * 1000)) {
        // Update available points and show reward popup (no numeric "points claimed" display)
        setAvailablePoints(parsed.availablePoints || 0);
        try {
          const remaining = parsed.availablePoints || 0;
          const rewardLabel = parsed.reward || parsed.rewardName || (parsed.rewards && parsed.rewards[0] && (parsed.rewards[0].name || parsed.rewards[0].label)) || parsed.prize || (parsed.raw && (parsed.raw.reward || parsed.raw.prize || parsed.raw.name)) || '';
          // reward popup/modal will show redeemed info; no numeric points toast
        } catch (e) {}
      }
      // Clear it so the popup doesn't repeat on subsequent mounts
      localStorage.removeItem('lastClaimResult');
    } catch (e) {}
  }, []);

  useEffect(() => {
    // Fetch available points
    const fetchPoints = async () => {
      try {
        if (!email) return;
        // Use centralized fetchAuth which handles token attachment and retry
        const url = `${API}/rewards?email=${encodeURIComponent(email)}&_=${Date.now()}`;
        const res = await fetchAuth(url, { method: 'GET' }, 7000);
        if (res && res.ok) {
          const data = res.json ?? res.json ?? (res.bodyText ? (() => { try { return JSON.parse(res.bodyText); } catch(e){ return null; } })() : null) ?? {};
          const available = data.availablePoints ?? data.available ?? data.unclaimed ?? data.points ?? 0;
          setAvailablePoints(Number(available) || 0);
        }
      } catch (e) { }
    };
    // expose fetchPoints to window for header button and events
    window.__shakeFetchPoints = fetchPoints;
    fetchPoints();
    // load reward definitions
    (async () => {
      try {
        const defs = await gameApi.getRewardDefinitions();
        setRewardDefs(defs && defs.rewards ? defs.rewards : (defs || []));
      } catch (e) {
        console.warn('Failed loading reward defs', e);
      }
    })();
  }, [email]);

  // Listen for claims/updates from other pages so we refresh immediately
  useEffect(() => {
    const onPointsUpdated = (ev) => {
      try {
        const detail = ev && ev.detail;
        const detailEmail = detail && detail.email;

        if (!detailEmail || detailEmail === email) {
          // If the event carries a result payload (same-tab dispatch), use it to update state.
          if (detail && detail.result) {
            const data = detail.result;
            setAvailablePoints(data.availablePoints ?? data.available ?? data.unclaimed ?? data.points ?? 0);

            // Only show a popup here if the origin didn't already show one
            if (!detail.popupShown) {
              try {
                // No numeric toast; reward modal will display redemption
              } catch (e) {}
            }
            return;
          }

          // Otherwise re-fetch from server (with cache-bust) to get latest available points
          (async () => {
            try {
              let token = null;
              try { const a = getAuth(); if (a.currentUser) token = await a.currentUser.getIdToken(); } catch(e) { token = null; }
              const headers = token ? { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' } : { 'Content-Type': 'application/json' };
              const res = await fetch(`${API}/rewards?email=${encodeURIComponent(email)}&_=${Date.now()}`, { headers, credentials: 'include' });
              if (res.ok) {
                const data = await res.json();
                setAvailablePoints(data.availablePoints ?? data.available ?? data.unclaimed ?? data.points ?? 0);
              }
            } catch (e) {}
          })();

          // If there's a lastClaimResult stored, show it (this covers cross-tab/storage events)
          try {
            const raw = localStorage.getItem('lastClaimResult');
            if (raw) {
              const parsed = JSON.parse(raw);
              if (parsed && parsed.email === email) {
                setAvailablePoints(parsed.availablePoints || 0);
                localStorage.removeItem('lastClaimResult');
                try {
                  const remaining = parsed.availablePoints || 0;
                  // No numeric toast; reward modal will display redemption
                } catch (e) {}
              }
            }
          } catch (e) {}
        }
      } catch (e) {}
    };
    window.addEventListener('pointsUpdated', onPointsUpdated);
    return () => window.removeEventListener('pointsUpdated', onPointsUpdated);
  }, [email]);

  useEffect(() => {
    const handleMotion = (ev) => {
      const a = ev.accelerationIncludingGravity || ev.acceleration || { x:0,y:0,z:0 };
      const { x, y, z } = a;
      if (lastAccel.current.x === null) {
        lastAccel.current = { x, y, z };
        return;
      }
      const dx = Math.abs(x - lastAccel.current.x || 0);
      const dy = Math.abs(y - lastAccel.current.y || 0);
      const dz = Math.abs(z - lastAccel.current.z || 0);
      lastAccel.current = { x, y, z };
      const magnitude = Math.sqrt(dx*dx + dy*dy + dz*dz);
      if (magnitude > SHAKE_THRESHOLD && availablePoints > 0 && !isShaking) {
        triggerClaim();
      }
    };

    // Modern iOS requires a user gesture to call DeviceMotionEvent.requestPermission().
    // We avoid a visible button by requesting permission on the first touch/click anywhere on the page.
    // This keeps the UX unobtrusive while still satisfying the browser requirement.
    const tryEnableMotionViaGesture = () => {
      try {
        if (window.DeviceMotionEvent && typeof window.DeviceMotionEvent.requestPermission === 'function') {
          window.DeviceMotionEvent.requestPermission().then(resp => {
            if (resp === 'granted') {
              try { window.addEventListener('devicemotion', handleMotion); } catch (e) {}
            }
          }).catch(() => {
            // user denied or permission unavailable
          });
        }
      } catch (e) {
        // some browsers may throw when calling requestPermission without a gesture
      }
    };

    // If the browser requires permission (iOS), listen once for the first user gesture.
    let gestureListenerAdded = false;
    const gestureHandler = () => {
      tryEnableMotionViaGesture();
      // remove the gesture listener after first use
      document.removeEventListener('touchstart', gestureHandler);
      document.removeEventListener('click', gestureHandler);
      gestureListenerAdded = false;
    };

    if (window.DeviceMotionEvent && typeof window.DeviceMotionEvent.requestPermission === 'function') {
      // Add one-time gesture listeners — passive to avoid blocking scrolling.
      document.addEventListener('touchstart', gestureHandler, { passive: true });
      document.addEventListener('click', gestureHandler, { passive: true });
      gestureListenerAdded = true;
      // Also attempt to request right away in case permission was already granted by the OS/settings.
      tryEnableMotionViaGesture();
    } else if (window.DeviceMotionEvent) {
      // No permission API — attach directly.
      try { window.addEventListener('devicemotion', handleMotion); } catch (e) {}
    }

    return () => {
      try { window.removeEventListener('devicemotion', handleMotion); } catch (e) {}
      if (gestureListenerAdded) {
        try { document.removeEventListener('touchstart', gestureHandler); } catch (e) {}
        try { document.removeEventListener('click', gestureHandler); } catch (e) {}
      }
    };
  }, [availablePoints, isShaking]);

  const triggerClaim = async () => {
    setIsShaking(true);
    try {
      // Call server shake endpoint via gameApi which attaches Authorization
      const data = await gameApi.shake(email);

      // Update UI state from server response
        // Prefer server-provided redemption info
        // Determine points claimed (server may provide pointsClaimed or redemption.cost)
        const serverAvailable = data && (data.availablePoints ?? data.available ?? data.unclaimed ?? data.points);
        const pointsClaimed = (data && (data.pointsClaimed || (data.redemption && data.redemption.cost) )) || 0;

        // Helper: choose reward from server-provided rewardDefs if available; otherwise fallback to local mapping
        const chooseReward = (points) => {
          const n = Number(points) || 0;
          // Try server-provided defs first
          if (Array.isArray(rewardDefs) && rewardDefs.length > 0) {
            // Normalize candidate rewards by cost/pointsRequired
            const candidates = rewardDefs.map(r => {
              const cost = r.pointsRequired ?? r.cost ?? r.points ?? r.pointsRequired ?? 0;
              return Object.assign({}, r, { __cost: Number(cost || 0) });
            }).filter(r => r.__cost <= n && r.__cost > 0);
            if (candidates.length > 0) {
              // choose the most expensive reward affordable by the claimed points
              candidates.sort((a,b) => b.__cost - a.__cost);
              const best = candidates[0];
              return { tier: best.tier || best.id || best._id || 'reward', title: best.title || best.name || best.label || best.reward || '', cost: best.__cost, rewardDef: best };
            }
          }
          // Fallback deterministic mapping
          if (n > 0 && n < 5) return { tier: 'small', title: 'RM3 voucher', cost: 1 };
          if (n < 10) return { tier: 'minor', title: 'RM6 voucher', cost: 5 };
          if (n < 20) return { tier: 'standard', title: 'RM8 credit', cost: 10 };
          if (n < 30) return { tier: 'large', title: 'RM13 credit', cost: 20 };
          if (n < 40) return { tier: 'premium', title: 'Keychain', cost: 30 };
          if (n < 50) return { tier: 'deluxe', title: 'Plushie', cost: 40 };
          return { tier: 'special', title: 'Special prize', cost: Math.min(n, 50) };
        };

        // If server returned a redemption, use it; otherwise compute one using available rewardDefs
        let redemption = data && data.redemption ? data.redemption : null;
        if (!redemption) {
          // determine claimed points: prefer server pointsClaimed, else use availablePoints (user claimed all) or 0
          const p = pointsClaimed || Number(availablePoints || 0);
          const chosen = chooseReward(p);
          redemption = {
            ok: true,
            cost: chosen.cost || pointsClaimed || 0,
            tier: chosen.tier,
            rewardDef: chosen.rewardDef ? chosen.rewardDef : { title: chosen.title },
            timestamp: Date.now()
          };
        }

        // Decide authoritative available points for UI: prefer server if it reflects a decrement,
        // otherwise apply a local decrement so the UI updates immediately.
        let computedAvailable = null;
        try {
          const serverVal = (typeof serverAvailable !== 'undefined' && serverAvailable !== null) ? Number(serverAvailable) : null;
          const before = Number(availablePoints || 0);
          const localAfter = Math.max(0, before - (redemption.cost || 0));
          if (serverVal !== null && !Number.isNaN(serverVal) && serverVal < before) {
            // server shows a reduced balance -> trust it
            computedAvailable = serverVal;
          } else {
            // server didn't reflect a decrement; use local deduction
            computedAvailable = localAfter;
          }
        } catch (e) {
          computedAvailable = Math.max(0, (availablePoints || 0) - (redemption.cost || 0));
        }
        setAvailablePoints(computedAvailable);

      // Persist the claim result so other pages/components can react
      let resultObj = null;
      try {
        // Persist the claim result (include our computed redemption so other tabs/components can render it)
        resultObj = {
          email,
          pointsClaimed: redemption.cost || data.pointsClaimed || 0,
          availablePoints: (typeof computedAvailable !== 'undefined' && computedAvailable !== null) ? computedAvailable : (serverAvailable != null ? serverAvailable : Math.max(0, (availablePoints || 0) - (redemption.cost || 0))),
          newTotalPoints: data.newTotalPoints || data.points || null,
          raw: data,
          redemption,
          timestamp: Date.now()
        };
        try { localStorage.setItem('lastClaimResult', JSON.stringify(resultObj)); } catch (e) {}

        // Re-fetch reward definitions from server to ensure the UI shows the admin-provided list
        try {
          const fresh = await gameApi.getRewardDefinitions();
          if (fresh && fresh.rewards) setRewardDefs(fresh.rewards);
        } catch (e) { /* ignore */ }
      } catch (e) {}

      // Notify other components
  // Notify other components and include the redemption object so they can show the reward tier immediately
  try {
    // Dispatch the persisted result object if available, otherwise fall back to server data merged with redemption
    const payload = resultObj || Object.assign({}, data || {}, { redemption });
    window.dispatchEvent(new CustomEvent('pointsUpdated', { detail: { email, result: payload, popupShown: true } }));
  } catch(e) {}

      // Show redeemed reward details if present
        // Show redeemed reward details
        if (redemption) {
          setLastRedemption(redemption);
          if (redemption.ok) setShowRewardModal(true);
        } else {
          setLastRedemption(null);
        }

      // show toast with reward info when available — prefer redemption fields
      try {
        if (data.redemption && data.redemption.ok) {
          const r = data.redemption;
          const title = (r.rewardDef && (r.rewardDef.title || r.rewardDef.name)) || (r.claim && r.claim.title) || '';
          const cost = r.cost != null ? r.cost : (r.rewardDef && (r.rewardDef.cost ?? r.rewardDef.points)) || 0;
          const newTotal = r.newPoints != null ? r.newPoints : (data.newTotalPoints ?? data.points ?? '–');
          // Use reward modal for redeemed info; no numeric toast
        } else {
          const rewardLabel = data.reward || data.rewardName || '';
          // Use reward modal for redeemed info; no numeric toast
        }
      } catch (e) {}

    } catch (err) {
      console.error('claim failed (server) — no local fallback. Error:', err);
      try { showToast('❌ Claim Failed', 'Could not contact server to claim points. Please try again later.'); } catch (e) {}
    } finally {
      // Always refresh server state (if available) and stop the claiming state
      // Do not force-refresh here — prefer event-driven updates so local decrements aren't immediately overwritten
      setIsShaking(false);
    }
  };
  

  // no enableMotion helper — motion is auto-requested on mount

  return (
    <div className="shake-dashboard">
      <div className="shake-section">
        <div className="shake-page shake-page-inner">
        <header className="shake-page-header">
          <button className="shake-back-btn" onClick={() => navigate('/')}>← Back</button>
          <h2>📱 Shake</h2>
          <div style={{ justifySelf: 'end' }}>
            <button className="refresh-btn" onClick={() => { if (window.__shakeFetchPoints) { window.__shakeFetchPoints(); } }}>Refresh</button>
          </div>
        </header>

        <p className="shake-page-subtitle">Shake your device to claim available points.</p>

        <div className="interactive-phone" onClick={() => { if (!isShaking) triggerClaim(); }}>
          <div className="phone-icon-large">📱</div>
          <div className="tap-hint">{isShaking ? 'Claiming...' : (availablePoints > 0 ? `Ready: ${availablePoints} pts` : 'No points available')}</div>
        </div>

        <div className="shake-actions">
          <button className="shake-btn" onClick={triggerClaim} disabled={isShaking || availablePoints === 0}>Claim Now</button>
        </div>

        {/* Reward definitions preview */}
        {rewardDefs && rewardDefs.length > 0 && (
          <div style={{ marginTop: 18 }}>
            <h3>Rewards</h3>
            <ul>
              {rewardDefs.map((d) => (
                <li key={d.id || d._id || d.tier}>{d.title || d.name || d.label} — Tier: {d.tier} — Cost: {d.cost ?? d.points ?? '–'}</li>
              ))}
            </ul>
          </div>
        )}

        {/* Last redemption details */}
        {lastRedemption && (
          <div style={{ marginTop: 12, padding: 10, border: '1px solid #ddd', borderRadius: 6 }}>
            <strong>Redeemed:</strong> {(lastRedemption.rewardDef && (lastRedemption.rewardDef.title || lastRedemption.rewardDef.name)) || (lastRedemption.claim && lastRedemption.claim.title) || '—'} (Tier: {lastRedemption.tier || '—'}, Cost: {lastRedemption.cost ?? (lastRedemption.rewardDef && (lastRedemption.rewardDef.pointsRequired ?? lastRedemption.rewardDef.cost)) ?? '–'})
          </div>
        )}

        <RewardModal open={showRewardModal} onClose={() => setShowRewardModal(false)} redemption={lastRedemption} />

        

  {/* lastClaimed display removed */}
        </div>
      </div>
    </div>
  );
}
