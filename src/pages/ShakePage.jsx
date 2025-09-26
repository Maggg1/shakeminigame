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
  const lastShakeAtRef = useRef(0);
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
          const availNum = Number(available) || 0;
          const totalNum = Number(total) || 0;
          setAvailablePoints(availNum);
          setTotalPoints(totalNum);
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
        const list = defs && defs.rewards ? defs.rewards : (defs || []);
        console.debug('[ShakePage] loaded reward definitions', list);
        setRewardDefs(list);
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
      const now = Date.now();
      const cooldown = 2000; // ms
      if (magnitude > SHAKE_THRESHOLD && availablePoints > 0 && !isShaking && !isAnimatingShake && !animatingFlagRef.current && (now - lastShakeAtRef.current > cooldown)) {
        startShakeSequence();
      }
    };

    // Modern iOS requires a user gesture to call DeviceMotionEvent.requestPermission().
    // We'll request permission in a direct user-gesture handler (pointerdown / touchend / click)
    // so the browser treats it as a valid gesture without adding any visible UI.
    let gestureListenerAdded = false;

    const gestureHandler = (ev) => {
      try {
        if (window.DeviceMotionEvent && typeof window.DeviceMotionEvent.requestPermission === 'function') {
          // Call requestPermission directly inside the user gesture handler so it runs on the
          // same gesture stack. Some browsers require this to consider it a user-initiated action.
          try {
            const p = window.DeviceMotionEvent.requestPermission();
            // requestPermission returns a promise; initiating the call inside this handler
            // is the important part — the promise resolution can be handled asynchronously.
            if (p && typeof p.then === 'function') {
              p.then((resp) => {
                if (resp === 'granted') {
                  try { window.addEventListener('devicemotion', handleMotion); } catch (e) {}
                }
              }).catch(() => {});
            }
          } catch (e) {
            // some browsers may throw when calling requestPermission without a gesture
          }
        }
      } catch (e) {}

      // remove the gesture listeners after first use
      try { document.removeEventListener('pointerdown', gestureHandler); } catch(e) {}
      try { document.removeEventListener('touchend', gestureHandler); } catch(e) {}
      try { document.removeEventListener('click', gestureHandler); } catch(e) {}
      gestureListenerAdded = false;
    };

    if (window.DeviceMotionEvent && typeof window.DeviceMotionEvent.requestPermission === 'function') {
      // Use non-passive listeners and include pointer/touchend for broader device support.
      const opts = { passive: false };
      document.addEventListener('pointerdown', gestureHandler, opts);
      document.addEventListener('touchend', gestureHandler, opts);
      document.addEventListener('click', gestureHandler, opts);
      gestureListenerAdded = true;

      // Also attempt to request right away in case permission was already granted by the OS/settings.
      try {
        // If permission is already granted this will just add the listener synchronously.
        if (window.DeviceMotionEvent && typeof window.DeviceMotionEvent.requestPermission === 'function') {
          // Note: calling requestPermission() here without a gesture may fail silently on some browsers,
          // but that's harmless — the gesture handler will handle the interactive request.
          try { window.DeviceMotionEvent.requestPermission().then((resp) => { if (resp === 'granted') { try { window.addEventListener('devicemotion', handleMotion); } catch(e){} } }).catch(()=>{}); } catch(e){}
        }
      } catch (e) {}
    } else if (window.DeviceMotionEvent) {
      // No permission API — attach directly.
      try { window.addEventListener('devicemotion', handleMotion); } catch (e) {}
    }

    return () => {
      try { window.removeEventListener('devicemotion', handleMotion); } catch (e) {}
      if (gestureListenerAdded) {
        try { document.removeEventListener('pointerdown', gestureHandler); } catch (e) {}
        try { document.removeEventListener('touchend', gestureHandler); } catch (e) {}
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
      // capture pre-claim points so we don't read state after an async setState
      const preClaimPoints = Number(availablePoints || 0);

      // Build a minimal payload and let the backend decide which reward to award.
      // We intentionally avoid any client-side reward selection to rely solely on server logic.
      const payload = { email, clientChosen: false };

      // Call server shake endpoint — expect server to return an authoritative `redemption` and `availablePoints`.
      const data = await gameApi.shake(email, payload);
      console.log('Shake response', data);

      const serverAvailable = (typeof data?.availablePoints !== 'undefined' && data?.availablePoints !== null) ? Number(data.availablePoints) : null;
      const serverRedemption = data?.redemption ?? null;

      if (serverRedemption) {
        // Use server-provided redemption and availablePoints when present
        setLastRedemption(serverRedemption);
        setShowRewardModal(true);
        // Try to infer how many points were consumed: serverAvailable preferred, then redemption.cost, then data.pointsClaimed, otherwise fall back to deducting 1 point
        const claimedFromRedemption = (serverRedemption && (Number(serverRedemption.cost) || Number(serverRedemption.pointsClaimed))) || null;
        const claimedFromData = (typeof data?.pointsClaimed !== 'undefined' && data.pointsClaimed !== null) ? Number(data.pointsClaimed) : null;
        const inferredClaim = (serverAvailable !== null && !Number.isNaN(Number(serverAvailable)))
          ? null
          : (Number.isFinite(Number(claimedFromRedemption)) ? Number(claimedFromRedemption) : (Number.isFinite(Number(claimedFromData)) ? Number(claimedFromData) : 1));

        const computedAvailable = (serverAvailable !== null && !Number.isNaN(Number(serverAvailable)))
          ? Number(serverAvailable)
          : Math.max(0, Number(preClaimPoints || 0) - Number(inferredClaim || 0));

        setAvailablePoints(computedAvailable);

        // Persist the claim result so other pages/components can react
        const resultObj = {
          email,
          pointsClaimed: serverRedemption.cost || data.pointsClaimed || 0,
          availablePoints: computedAvailable,
          newTotalPoints: data.newTotalPoints || data.points || null,
          raw: data,
          redemption: serverRedemption,
          timestamp: Date.now()
        };
        try { localStorage.setItem('lastClaimResult', JSON.stringify(resultObj)); } catch (e) {}

        // Re-fetch reward definitions to ensure UI uses server-provided list (non-blocking)
        try {
          const fresh = await gameApi.getRewardDefinitions();
          if (fresh && fresh.rewards) setRewardDefs(fresh.rewards);
        } catch (e) { /* ignore */ }

        // Notify other components and indicate a popup was shown
        try {
          window.dispatchEvent(new CustomEvent('pointsUpdated', { detail: { email, result: resultObj, popupShown: true } }));
        } catch (e) {}
      } else {
        // No redemption returned — update points if server provided them, otherwise fallback to optimistic decrement
        if (serverAvailable !== null && !Number.isNaN(Number(serverAvailable))) {
          setAvailablePoints(Number(serverAvailable));
        } else {
          // fallback: if server didn't confirm, decrement locally by 1 (or use data.pointsClaimed if present)
          const claimed = (typeof data?.pointsClaimed !== 'undefined' && data.pointsClaimed !== null) ? Number(data.pointsClaimed) : 1;
          setAvailablePoints(prev => Math.max(0, (Number(prev) || 0) - Number(claimed)));
        }
        // don't show a modal if server didn't provide a redemption
        setShowRewardModal(false);
        console.warn('Server did not return a redemption for shake', data);
      }

    } catch (err) {
      console.error('claim failed (server) — no local fallback. Error:', err);
      try { setToast({ visible: true, title: '❌ Claim Failed', body: 'Could not contact server to claim points. Please try again later.' }); } catch (e) {}
    } finally {
      // Always refresh server state (if available) and stop the claiming state
      // Do not force-refresh here — prefer event-driven updates so local decrements aren't immediately overwritten
      setIsShaking(false);
    }
  };

  // Start a 3s shake animation/audio sequence and then perform claim
  const startShakeSequence = () => {
    if (isShaking || isAnimatingShake || animatingFlagRef.current) return;
    // record the time so a short cooldown prevents duplicates
    try { lastShakeAtRef.current = Date.now(); } catch (e) {}
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
    onClick={() => {
      const now = Date.now();
      const cooldown = 2000;
      if (availablePoints > 0 && !isShaking && !isAnimatingShake && !animatingFlagRef.current && (now - lastShakeAtRef.current > cooldown)) {
        startShakeSequence();
      }
    }}
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
