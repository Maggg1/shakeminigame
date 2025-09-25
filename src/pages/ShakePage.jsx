import React, { useEffect, useState, useRef } from 'react';
import '../components/ShakeDashboard.css';
import { API } from '../config/api';
import { useAuth } from '../hooks/useAuth';
import { useNavigate } from 'react-router-dom';
import { getAuth } from 'firebase/auth';
import { PointsSystem } from '../utils/pointsSystem';
import fetchAuth from '../utils/fetchAuth';

const SHAKE_THRESHOLD = 15; // Acceleration threshold

export default function ShakePage() {
  const { email } = useAuth();
  const navigate = useNavigate();
  const [isShaking, setIsShaking] = useState(false);
  const [availablePoints, setAvailablePoints] = useState(0);
  const [lastClaimed, setLastClaimed] = useState(null);
  const [toast, setToast] = useState({ visible: false, title: '', body: '' });
  const [debug, setDebug] = useState({ show: false, lastRequest: null, lastResponse: null, lastError: null });
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
  // Update local state and show reward popup
  setLastClaimed(parsed.pointsClaimed || 0);
  setAvailablePoints(parsed.availablePoints || 0);
        try {
          const pointsClaimed = parsed.pointsClaimed || 0;
          const remaining = parsed.availablePoints || 0;
          // Prefer backend-provided reward labels if available
          const rewardLabel = parsed.reward || parsed.rewardName || (parsed.rewards && parsed.rewards[0] && (parsed.rewards[0].name || parsed.rewards[0].label)) || parsed.prize || (parsed.raw && (parsed.raw.reward || parsed.raw.prize || parsed.raw.name)) || '';
          const rewardPart = rewardLabel ? ` — ${rewardLabel}` : '';
          showToast('🎉 Points Claimed!', `+${pointsClaimed} pts${rewardPart} — Remaining: ${remaining} pts`);
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
        const tokenPresent = Boolean(localStorage.getItem('authToken') || localStorage.getItem('emailAuth_token'));
        setDebug(d => ({ ...d, lastRequest: { url, method: 'GET', hasBody: false, hasAuth: tokenPresent }, lastResponse: null, lastError: null }));
        const res = await fetchAuth(url, { method: 'GET' }, 7000);
        if (res) {
          setDebug(d => ({ ...d, lastResponse: { status: res.status, ok: res.ok, bodyText: (res.bodyText || null), json: res.json || null } }));
        }
        if (res && res.ok) {
          const data = res.json ?? (res.bodyText ? (() => { try { return JSON.parse(res.bodyText); } catch(e){ return null; } })() : null) ?? {};
          const available = data.availablePoints ?? data.available ?? data.unclaimed ?? data.points ?? 0;
          setAvailablePoints(Number(available) || 0);
        }
      } catch (e) { }
    };
    // expose fetchPoints to window for header button and events
    window.__shakeFetchPoints = fetchPoints;
    fetchPoints();
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
                const pointsClaimed = data.pointsClaimed || 0;
                const remaining = data.availablePoints || 0;
                const rewardLabel = data.reward || data.rewardName || (data.rewards && data.rewards[0] && (data.rewards[0].name || data.rewards[0].label)) || data.prize || (data.raw && (data.raw.reward || data.raw.prize || data.raw.name)) || '';
                const rewardPart = rewardLabel ? ` — ${rewardLabel}` : '';
                showToast('🎉 Points Claimed!', `+${pointsClaimed} pts${rewardPart} — Remaining: ${remaining} pts`);
              } catch (e) {}
            }
            return;
          }

          // Otherwise re-fetch from server (with cache-bust) to get latest available points
          (async () => {
            try {
              const url = `${API}/rewards?email=${encodeURIComponent(email)}&_=${Date.now()}`;
              const tokenPresent = Boolean(localStorage.getItem('authToken') || localStorage.getItem('emailAuth_token'));
              setDebug(d => ({ ...d, lastRequest: { url, method: 'GET', hasBody: false, hasAuth: tokenPresent }, lastResponse: null, lastError: null }));
              const res = await fetchAuth(url, { method: 'GET' }, 7000);
              if (res) setDebug(d => ({ ...d, lastResponse: { status: res.status, ok: res.ok, bodyText: (res.bodyText || null), json: res.json || null } }));
              if (res && res.ok) {
                const data = res.json ?? (res.bodyText ? (() => { try { return JSON.parse(res.bodyText); } catch(e){ return null; } })() : null) ?? {};
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
                setLastClaimed(parsed.pointsClaimed || 0);
                setAvailablePoints(parsed.availablePoints || 0);
                localStorage.removeItem('lastClaimResult');
                try {
                  const pointsClaimed = parsed.pointsClaimed || 0;
                  const remaining = parsed.availablePoints || 0;
                  let reward = 'No reward';
                  if (pointsClaimed > 0 && pointsClaimed < 5) reward = 'RM3 voucher';
                  else if (pointsClaimed < 10) reward = 'RM6 voucher';
                  else if (pointsClaimed < 20) reward = 'RM8 credit';
                  else if (pointsClaimed < 30) reward = 'RM13 credit';
                  else if (pointsClaimed < 40) reward = 'Keychain';
                  else if (pointsClaimed < 50) reward = 'Plushie';
                  else reward = 'Special prize';
                  showToast('🎉 Points Claimed!', `+${pointsClaimed} pts — ${reward} — Remaining: ${remaining} pts`);
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

    // Try to attach device motion listener automatically on mount.
    // Note: on iOS, requestPermission may require a user gesture and can fail silently.
    if (window.DeviceMotionEvent && typeof window.DeviceMotionEvent.requestPermission === 'function') {
      try {
        window.DeviceMotionEvent.requestPermission().then((resp) => {
          if (resp === 'granted') window.addEventListener('devicemotion', handleMotion);
        }).catch(() => {
          // permission denied or unavailable
        });
      } catch (e) {
        // calling requestPermission may throw on some browsers without user gesture
      }
    } else if (window.DeviceMotionEvent) {
      try { window.addEventListener('devicemotion', handleMotion); } catch (e) {}
    }

    return () => {
      if (window.DeviceMotionEvent) window.removeEventListener('devicemotion', handleMotion);
    };
  }, [availablePoints, isShaking]);

  const triggerClaim = async () => {
    setIsShaking(true);
    try {
      const body = { email, pointsToClaim: 1 };
      const url = `${API}/shake`;
      const tokenPresent = Boolean(localStorage.getItem('authToken') || localStorage.getItem('emailAuth_token'));
      setDebug(d => ({ ...d, lastRequest: { url, method: 'POST', hasBody: true, body, hasAuth: tokenPresent }, lastResponse: null, lastError: null }));

      // Only claim a single point per shake. Use fetchAuth which will attach token and retry on 401.
      const res = await fetchAuth(url, {
        method: 'POST',
        body: JSON.stringify(body),
        headers: { 'Content-Type': 'application/json' }
      }, 7000);

      if (res) setDebug(d => ({ ...d, lastResponse: { status: res.status, ok: res.ok, bodyText: (res.bodyText || null), json: res.json || null } }));

      if (res && res.ok) {
        const data = res.json ?? (res.bodyText ? (() => { try { return JSON.parse(res.bodyText); } catch(e){ return null; } })() : null) ?? {};
        try { console.debug('[ShakePage] claim response', data); } catch(e){}

        // Normalize various backend shapes. Some APIs return `pointsClaimed`;
        // others return `points` as the user's total. We handle both.
        const ptsClaimed = data.pointsClaimed ?? data.claimedPoints ?? data.claimed ?? 0;
        const available = data.availablePoints ?? data.available ?? data.unclaimed ?? 0;
        const total = data.newTotalPoints ?? data.totalPoints ?? data.points ?? null;
        const rewardsUnlocked = data.rewardsUnlocked ?? data.rewards ?? null;
        const message = data.message ?? null;

        setLastClaimed(ptsClaimed || 0);
        // Update available only if server supplied a value
        if (typeof available === 'number') setAvailablePoints(available);

        // Persist the claim result so other pages/components can react
        try {
          const resultObj = {
            email,
            pointsClaimed: ptsClaimed || 0,
            availablePoints: Number(available) || 0,
            newTotalPoints: total,
            rewardsUnlocked: rewardsUnlocked ?? null,
            message: message ?? null,
            raw: data,
            timestamp: Date.now()
          };
          localStorage.setItem('lastClaimResult', JSON.stringify(resultObj));
        } catch (e) {}

        // Notify other components (e.g., dashboard) to refresh their data
        try {
          const resultForEvent = { ...(data || {}), pointsClaimed: ptsClaimed, availablePoints: available, newTotalPoints: total };
          window.dispatchEvent(new CustomEvent('pointsUpdated', { detail: { email, result: resultForEvent, popupShown: true } }));
        } catch (e) {}

        // Show appropriate toast: prefer server `message` when it indicates nothing to claim,
        // otherwise surface unlocked rewards or claimed points.
        try {
          if (message && /no unclaimed/i.test(message)) {
            showToast('No unclaimed points', message);
          } else if (rewardsUnlocked && Array.isArray(rewardsUnlocked) && rewardsUnlocked.length) {
            showToast('🎉 Rewards Unlocked!', `${rewardsUnlocked.join(', ')} — Total: ${total ?? '–'} pts`);
          } else {
            const ptsLabel = ptsClaimed || 0;
            showToast('🎉 Points Claimed!', `+${ptsLabel} pts — Total: ${total ?? '–'} pts`);
          }
        } catch (e) {}
      }
      else {
        // Backend returned non-OK — fallback to local PointsSystem to avoid losing points
        try {
          try { console.warn('[ShakePage] claim failed response', res && (res.bodyText || res.statusText || res.status)); } catch(e){}
          if (email) {
            const ps = new PointsSystem(email);
            // Claim one point locally as a fallback
            const localClaim = ps.claimPoints(1);
            const resultObj = {
              email,
              pointsClaimed: localClaim.pointsClaimed || 0,
              availablePoints: ps.availablePoints || 0,
              newTotalPoints: ps.totalPoints || null,
              raw: { fallback: true },
              timestamp: Date.now()
            };
            localStorage.setItem('lastClaimResult', JSON.stringify(resultObj));
            window.dispatchEvent(new CustomEvent('pointsUpdated', { detail: { email, result: resultObj } }));
            setLastClaimed(localClaim.pointsClaimed || 0);
            setAvailablePoints(ps.availablePoints || 0);
            // show fallback toast using any available backend-like fields
            try {
              const pointsClaimed = resultObj.pointsClaimed || 0;
              const rewardLabel = resultObj.reward || resultObj.rewardName || (resultObj.rewards && resultObj.rewards[0] && (resultObj.rewards[0].name || resultObj.rewards[0].label)) || resultObj.prize || '';
              const rewardPart = rewardLabel ? ` — ${rewardLabel}` : '';
              showToast('🎉 Points Claimed!', `+${pointsClaimed} pts${rewardPart} — Remaining: ${resultObj.availablePoints || 0} pts`);
            } catch (e) {}
          }
          if (res && res.status) {
            setDebug(d => ({ ...d, lastError: { status: res.status, statusText: res.statusText || '', bodyText: res.bodyText || null } }));
          }
        } catch (e) {}
      }
    } catch (e) {
      console.error('claim failed', e);
      setDebug(d => ({ ...d, lastError: { message: (e && e.message) || String(e) } }));
    } finally {
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
            <button className="refresh-btn" style={{ marginLeft: 8 }} onClick={() => setDebug(d => ({ ...d, show: !d.show }))}>{debug.show ? 'Hide debug' : 'Show debug'}</button>
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

        

        {lastClaimed !== null && <p style={{ marginTop: 12 }}>Last claimed: {lastClaimed} pts</p>}
        {debug.show && (
          <div style={{ marginTop: 12, padding: 8, background: 'rgba(0,0,0,0.05)', borderRadius: 6, fontSize: 12, maxWidth: 680 }}>
            <div style={{ fontWeight: 'bold', marginBottom: 6 }}>Debug</div>
            <div><strong>Last Request:</strong> {debug.lastRequest ? `${debug.lastRequest.method} ${debug.lastRequest.url.split('?')[0]}${debug.lastRequest.hasBody ? ' (body)' : ''} — auth:${debug.lastRequest.hasAuth ? 'yes' : 'no'}` : '—'}</div>
            <div style={{ marginTop: 6 }}><strong>Last Response:</strong> {debug.lastResponse ? `status:${debug.lastResponse.status} ok:${String(debug.lastResponse.ok)}` : '—'}</div>
            {debug.lastResponse && debug.lastResponse.bodyText && (
              <pre style={{ whiteSpace: 'pre-wrap', marginTop: 6, background: '#fff', padding: 8, borderRadius: 4, maxHeight: 200, overflow: 'auto' }}>{debug.lastResponse.bodyText}</pre>
            )}
            {debug.lastResponse && debug.lastResponse.json && (
              <pre style={{ whiteSpace: 'pre-wrap', marginTop: 6, background: '#fff', padding: 8, borderRadius: 4, maxHeight: 200, overflow: 'auto' }}>{JSON.stringify(debug.lastResponse.json, null, 2)}</pre>
            )}
            {debug.lastError && (
              <div style={{ marginTop: 6, color: 'crimson' }}><strong>Error:</strong> {debug.lastError.message || `${debug.lastError.status || ''} ${debug.lastError.statusText || ''}`}</div>
            )}
          </div>
        )}
        </div>
      </div>
    </div>
  );
}
