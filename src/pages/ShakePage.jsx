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
import shakeSfx from '../audio/vocal-warble-362405.mp3';
import walrusImg from '../assets/walrus.png';

const SHAKE_THRESHOLD = 15; // Acceleration threshold

export default function ShakePage() {
  const { email } = useAuth();
  const navigate = useNavigate();
  const [isShaking, setIsShaking] = useState(false);
  const [availablePoints, setAvailablePoints] = useState(0);
  const [totalPoints, setTotalPoints] = useState(0);
  const [rewardDefs, setRewardDefs] = useState([]);
  const [lastRedemption, setLastRedemption] = useState(null);
  const [showRewardModal, setShowRewardModal] = useState(false);
  const [toast, setToast] = useState({ visible: false, title: '', body: '' });
  const [lastUpdated, setLastUpdated] = useState(null);
  const [lifetimeEarned, setLifetimeEarned] = useState(0);
  const [nextRewardPoints, setNextRewardPoints] = useState(null);
  const lastAccel = useRef({ x: null, y: null, z: null });
  const shakeTimeoutRef = useRef(null);
  const shakeAudioRef = useRef(null);
  const animatingFlagRef = useRef(false);
  // audio removed: vocal-warble shake SFX disabled per request
  const audioPlayingRef = useRef(false);
  const startSeqIdRef = useRef(0);
  const [isAnimatingShake, setIsAnimatingShake] = useState(false);

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
          const data = res.json ?? (res.bodyText ? (() => { try { return JSON.parse(res.bodyText); } catch(e){ return null; } })() : null) ?? {};
          const available = data.availablePoints ?? data.available ?? data.unclaimed ?? data.points ?? 0;
          const total = (data.totalPoints ?? data.total ?? (data.user && data.user.totalPoints)) ?? 0;
          const lifetime = (data.lifetimeEarned ?? data.totalEarned ?? (data.user && data.user.lifetimeEarned) ?? total) || 0;
          setAvailablePoints(Number(available) || 0);
          setTotalPoints(Number(total) || 0);
          setLifetimeEarned(Number(lifetime) || 0);
          setLastUpdated(new Date());
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

    // compute next reward points when defs or availablePoints change
    useEffect(() => {
      try {
        if (!Array.isArray(rewardDefs) || rewardDefs.length === 0) {
          setNextRewardPoints(null);
          return;
        }
        const costs = rewardDefs.map(r => Number(r.pointsRequired ?? r.cost ?? r.points ?? 0)).filter(n => n > 0).sort((a,b) => a - b);
        if (costs.length === 0) { setNextRewardPoints(null); return; }
        const greater = costs.find(c => c > (Number(availablePoints) || 0));
        setNextRewardPoints(greater ?? costs[0]);
      } catch (e) { setNextRewardPoints(null); }
    }, [rewardDefs, availablePoints]);

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
      if (magnitude > SHAKE_THRESHOLD && availablePoints > 0 && !isShaking && !isAnimatingShake) {
        startShakeSequence();
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
      // cleanup any running shake timeout
      try { if (shakeTimeoutRef.current) { clearTimeout(shakeTimeoutRef.current); shakeTimeoutRef.current = null; } } catch(e) {}
      // stop and release any running timeout and audio
      try { if (shakeTimeoutRef.current) { clearTimeout(shakeTimeoutRef.current); shakeTimeoutRef.current = null; } } catch(e) {}
      try {
        if (shakeAudioRef.current) {
          try { shakeAudioRef.current.pause(); } catch(e) {}
          try { shakeAudioRef.current.currentTime = 0; } catch(e) {}
          shakeAudioRef.current = null;
        }
      } catch(e) {}
      try { animatingFlagRef.current = false; } catch(e) {}
    };
  }, [availablePoints, isShaking]);

  const triggerClaim = async () => {
    setIsShaking(true);
    try {
      // Choose a reward locally first (so we can send a meaningful request to the backend)
      const chooseReward = (points) => {
        const n = Number(points) || 0;
        if (Array.isArray(rewardDefs) && rewardDefs.length > 0) {
          const candidates = rewardDefs.map(r => {
            const cost = r.pointsRequired ?? r.cost ?? r.points ?? 0;
            return Object.assign({}, r, { __cost: Number(cost || 0) });
          }).filter(r => r.__cost <= n && r.__cost > 0);
          if (candidates.length > 0) {
            candidates.sort((a,b) => b.__cost - a.__cost);
            const best = candidates[0];
            return { tier: best.tier || best.id || best._id || 'reward', title: best.title || best.name || best.label || best.reward || '', cost: best.__cost, rewardDef: best };
          }
        }
        if (n > 0 && n < 5) return { tier: 'small', title: 'RM3 voucher', cost: 1 };
        if (n < 10) return { tier: 'minor', title: 'RM6 voucher', cost: 5 };
        if (n < 20) return { tier: 'standard', title: 'RM8 credit', cost: 10 };
        if (n < 30) return { tier: 'large', title: 'RM13 credit', cost: 20 };
        if (n < 40) return { tier: 'premium', title: 'Keychain', cost: 30 };
        if (n < 50) return { tier: 'deluxe', title: 'Plushie', cost: 40 };
        return { tier: 'special', title: 'Special prize', cost: Math.min(n, 50) };
      };

      // Client-side chosen reward (sent to server for validation/deduction)
      const clientPoints = Number(availablePoints || 0);
      const clientChosen = chooseReward(clientPoints);
      const payload = {
        email,
        rewardId: clientChosen.rewardDef && (clientChosen.rewardDef._id || clientChosen.rewardDef.id) || null,
        rewardTitle: clientChosen.title || null,
        cost: clientChosen.cost || 0,
        clientChosen: true
      };

      // Build a client-side redemption fallback (based on clientChosen)
      const redemptionFallback = {
        ok: true,
        cost: clientChosen.cost || 0,
        tier: clientChosen.tier,
        rewardDef: clientChosen.rewardDef ? clientChosen.rewardDef : { title: clientChosen.title },
        timestamp: Date.now()
      };

      // Optimistic UI: show the reward modal immediately with the fallback redemption
      try {
        const before = Number(availablePoints || 0);
        const localAfter = Math.max(0, before - (redemptionFallback.cost || 0));
        setLastRedemption(redemptionFallback);
        setShowRewardModal(true);
        setAvailablePoints(localAfter);
      } catch (e) {}

  // Call server shake endpoint with chosen reward payload (update UI when server responds)
  const data = await gameApi.shake(email, payload);
  console.log('Shake response', data);

  // Determine server-provided values (if any)
  const serverAvailable = data?.availablePoints ?? data?.points ?? null;
  const serverRedemption = data?.redemption ?? null;

      // Final redemption: prefer server's redemption when present
      const finalRedemption = serverRedemption || redemptionFallback;

      // Decide authoritative available points for UI: prefer server if it reflects a decrement,
      // otherwise keep the local decrement we already displayed.
      let computedAvailable = null;
      try {
        const serverVal = (typeof serverAvailable !== 'undefined' && serverAvailable !== null) ? Number(serverAvailable) : null;
        const before = Number(availablePoints || 0);
        const localAfter = Math.max(0, before);
        if (serverVal !== null && !Number.isNaN(serverVal) && serverVal < (before + (finalRedemption.cost || 0))) {
          // server reports a lower value than pre-claim, trust it
          computedAvailable = serverVal;
        } else {
          // keep the local after we already set
          computedAvailable = localAfter;
        }
      } catch (e) {
        computedAvailable = Number(availablePoints || 0);
      }
      setAvailablePoints(computedAvailable);

      // Persist the claim result so other pages/components can react
      let resultObj = null;
      try {
        resultObj = {
          email,
          pointsClaimed: finalRedemption.cost || data.pointsClaimed || 0,
          availablePoints: (typeof computedAvailable !== 'undefined' && computedAvailable !== null) ? computedAvailable : (serverAvailable != null ? serverAvailable : Math.max(0, (availablePoints || 0) - (finalRedemption.cost || 0)) ),
          newTotalPoints: data.newTotalPoints || data.points || null,
          raw: data,
          redemption: finalRedemption,
          timestamp: Date.now()
        };
        try { localStorage.setItem('lastClaimResult', JSON.stringify(resultObj)); } catch (e) {}

        // Re-fetch reward definitions from server to ensure the UI shows the admin-provided list
        try {
          const fresh = await gameApi.getRewardDefinitions();
          if (fresh && fresh.rewards) setRewardDefs(fresh.rewards);
        } catch (e) { /* ignore */ }
      } catch (e) {}

      // Notify other components and include the redemption object so they can show the reward tier immediately
      try {
        const payloadEvent = resultObj || Object.assign({}, data || {}, { redemption: finalRedemption });
        window.dispatchEvent(new CustomEvent('pointsUpdated', { detail: { email, result: payloadEvent, popupShown: true } }));
      } catch(e) {}

      // Show final redemption details if present (update modal contents)
      if (finalRedemption) {
        setLastRedemption(finalRedemption);
      } else {
        setLastRedemption(null);
      }
      // show toast with reward info when available — prefer redemption fields
      try {
        if ((data && data.redemption && data.redemption.ok) || (finalRedemption && finalRedemption.ok)) {
          const r = (data && data.redemption) || finalRedemption;
          const title = (r.rewardDef && (r.rewardDef.title || r.rewardDef.name)) || (r.claim && r.claim.title) || '';
          const cost = r.cost != null ? r.cost : (r.rewardDef && (r.rewardDef.cost ?? r.rewardDef.points)) || 0;
          const newTotal = r.newPoints != null ? r.newPoints : ((data && (data.newTotalPoints ?? data.points)) ?? '–');
          // Use reward modal for redeemed info; no numeric toast
        } else {
          const rewardLabel = data && (data.reward || data.rewardName) || '';
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

  // Start a 3s shake animation/audio sequence and then perform claim
  const startShakeSequence = () => {
    if (isShaking || isAnimatingShake || animatingFlagRef.current) return;
    // set a synchronous lock so concurrent calls can't race
    animatingFlagRef.current = true;
    setIsAnimatingShake(true);
    try {
      // start a new sequence id for this shake
      const mySeq = ++startSeqIdRef.current;
      console.debug('[shake] start seq', mySeq);

      // Stop any prior audio instance
      try {
        if (shakeAudioRef.current) {
          try { shakeAudioRef.current.pause(); } catch(e) {}
          try { shakeAudioRef.current.currentTime = 0; } catch(e) {}
        }
      } catch (e) {}

      // create and play the shake SFX
      try {
        const audio = new Audio(shakeSfx);
        audio._seq = mySeq;
        shakeAudioRef.current = audio;
        audioPlayingRef.current = true;
        try {
          audio.currentTime = 0;
          const p = audio.play();
          if (p && typeof p.then === 'function') p.catch(() => { audioPlayingRef.current = false; console.debug('[shake] play rejected for seq', mySeq); });
        } catch (e) { audioPlayingRef.current = false; console.debug('[shake] play throw', e, mySeq); }
      } catch (e) { console.debug('[shake] audio create/play failed', e); }
    } catch (e) { console.debug('[shake] start error', e); }

    // Ensure the animation lasts ~1 second then stop audio and trigger claim
    shakeTimeoutRef.current = setTimeout(async () => {
      try {
        const cur = shakeAudioRef.current;
        if (cur) {
          try { cur.pause(); } catch(e) {}
          try { cur.currentTime = 0; } catch(e) {}
          if (cur._seq === startSeqIdRef.current) {
            shakeAudioRef.current = null;
          }
        }
      } catch (e) {}
      try { audioPlayingRef.current = false; } catch(e) {}

      shakeTimeoutRef.current = null;
      setIsAnimatingShake(false);
      animatingFlagRef.current = false;
      // Now call the claim flow
      try { await triggerClaim(); } catch(e) {}
    }, 2000);
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

        <p className="shake-page-subtitle">Shake or Tap to claim your available points.</p>

        <div style={{ textAlign: 'center', margin: '18px 0' }}>
          <div style={{ marginTop: 6, fontSize: 16, color: '#444' }}>{availablePoints > 0 ? 'Ready to claim' : 'No points available'}</div>
        </div>

  <div
    className={`interactive-phone ${isAnimatingShake ? 'shaking' : ''} ${availablePoints > 0 ? '' : 'disabled'}`}
    onClick={() => { if (availablePoints > 0 && !isShaking && !isAnimatingShake) { startShakeSequence(); } }}
    role="button"
    aria-disabled={availablePoints <= 0}
  >
    <img src={walrusImg} alt="walrus" className="phone-icon-large-image" />
          <div className="tap-hint">{isShaking ? 'Claiming...' : (availablePoints > 0 ? `Ready: ${availablePoints} pts` : 'No points available')}</div>
        </div>

        {/* Claim button, reward list and last redemption removed per request */}

        <RewardModal open={showRewardModal} onClose={() => setShowRewardModal(false)} redemption={lastRedemption} />

        

  {/* lastClaimed display removed */}
        </div>
      </div>
    </div>
  );
}
