import React, { useEffect, useState, useRef } from 'react';
import '../components/ShakeDashboard.css';
import { API } from '../config/api';
import { useAuth } from '../hooks/useAuth';
import { useNavigate } from 'react-router-dom';
import { getAuth } from 'firebase/auth';
import { PointsSystem } from '../utils/pointsSystem';

const SHAKE_THRESHOLD = 15; // Acceleration threshold

export default function ShakePage() {
  const { email } = useAuth();
  const navigate = useNavigate();
  const [isShaking, setIsShaking] = useState(false);
  const [availablePoints, setAvailablePoints] = useState(0);
  const [lastClaimed, setLastClaimed] = useState(null);
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
          let reward = 'No reward';
          if (pointsClaimed > 0 && pointsClaimed < 5) reward = 'RM3 voucher';
          else if (pointsClaimed < 10) reward = 'RM6 voucher';
          else if (pointsClaimed < 20) reward = 'RM8 credit';
          else if (pointsClaimed < 30) reward = 'RM13 credit';
          else if (pointsClaimed < 40) reward = 'Keychain';
          else if (pointsClaimed < 50) reward = 'Plushie';
          else reward = 'Special prize';
          alert(`🎉 Points Claimed!\n💰 +${pointsClaimed} points\n📦 Reward: ${reward}\n🔁 Remaining to claim: ${remaining} pts`);
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
        // Attach Firebase ID token
        let token = null;
        try { const a = getAuth(); if (a.currentUser) token = await a.currentUser.getIdToken(); } catch(e) { token = null; }
  const headers = token ? { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' } : { 'Content-Type': 'application/json' };
        // Add a cache-busting timestamp to avoid stale responses
        const res = await fetch(`${API}/rewards?email=${encodeURIComponent(email)}&_=${Date.now()}`, { headers, credentials: 'include' });
        if (res.ok) {
          const data = await res.json();
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
        const detailEmail = ev && ev.detail && ev.detail.email;
        if (!detailEmail || detailEmail === email) {
          // Re-fetch from server (with cache-bust)
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

          // If there's a lastClaimResult stored, show it
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
                  alert(`🎉 Points Claimed!\n💰 +${pointsClaimed} points\n📦 Reward: ${reward}\n🔁 Remaining to claim: ${remaining} pts`);
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
      // Attach Firebase ID token
      let postToken = null;
      try { const a = getAuth(); if (a.currentUser) postToken = await a.currentUser.getIdToken(); } catch(e) { postToken = null; }
      const postHeaders = postToken ? { 'Content-Type': 'application/json', 'Authorization': `Bearer ${postToken}` } : { 'Content-Type': 'application/json' };
      // Only claim a single point per shake
      const res = await fetch(`${API}/shake`, {
        method: 'POST',
        headers: postHeaders,
        body: JSON.stringify({ email, pointsToClaim: 1 }),
        credentials: 'include'
      });
      if (res.ok) {
        const data = await res.json();
        setLastClaimed(data.pointsClaimed || 0);
        setAvailablePoints(data.availablePoints || 0);
        // Persist the claim result so other pages/components can react
        try {
          const resultObj = {
            email,
            pointsClaimed: data.pointsClaimed || 0,
            availablePoints: data.availablePoints || 0,
            newTotalPoints: data.newTotalPoints || null,
            raw: data,
            timestamp: Date.now()
          };
          localStorage.setItem('lastClaimResult', JSON.stringify(resultObj));
        } catch (e) {}

        // Notify other components (e.g., dashboard) to refresh their data
        try {
          window.dispatchEvent(new CustomEvent('pointsUpdated', { detail: { email, result: data } }));
        } catch (e) {}

        // Show a quick reward popup similar to dashboard
        try {
          const pointsClaimed = data.pointsClaimed || 0;
          let reward = 'No reward';
          if (pointsClaimed > 0 && pointsClaimed < 5) reward = 'RM3 voucher';
          else if (pointsClaimed < 10) reward = 'RM6 voucher';
          else if (pointsClaimed < 20) reward = 'RM8 credit';
          else if (pointsClaimed < 30) reward = 'RM13 credit';
          else if (pointsClaimed < 40) reward = 'Keychain';
          else if (pointsClaimed < 50) reward = 'Plushie';
          else reward = 'Special prize';
          alert(`🎉 Points Claimed!\n💰 +${pointsClaimed} points\n📦 Reward: ${reward}\n📊 Total: ${data.newTotalPoints ?? '–' } points`);
        } catch (e) {}
      }
      else {
        // Backend returned non-OK — fallback to local PointsSystem to avoid losing points
        try {
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
          }
        } catch (e) {}
      }
    } catch (e) {
      console.error('claim failed', e);
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
        </div>
      </div>
    </div>
  );
}
