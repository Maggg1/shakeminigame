import React, { useState, useEffect } from 'react';
import ReactDOM from 'react-dom';
import './ShakeDashboard.css';
import { API } from '../config/api';

export const ShakeDashboard = ({ phoneNumber }) => {
  // Use email as user identifier (phoneNumber prop name kept for compatibility)
  const userIdentifier = phoneNumber; // This will now be an email
  // Real state connected to admin backend
  const [availablePoints, setAvailablePoints] = useState(0);
  const [totalPoints, setTotalPoints] = useState(0);
  const [isShaking, setIsShaking] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [lastFetchStatus, setLastFetchStatus] = useState(null);
  const [lastFetchRaw, setLastFetchRaw] = useState(null);
  const [claimAmount, setClaimAmount] = useState('all');
  const [helpOpen, setHelpOpen] = useState(false);

  // Backend base URL (configured via env or defaults)
  const ADMIN_API_BASE = API;

  // Reward ladder (display-only) — backed by admin-defined rewards in backend
  const rewardLadder = [
    { points: 1, reward: "RM1 Credit" },
    { points: 10, reward: "RM5 Voucher" },
    { points: 25, reward: "RM15 Voucher" },
    { points: 50, reward: "RM40 Voucher" },
    { points: 100, reward: "Physical Plushie" }
  ];

  // Fetch user points from admin backend
  const fetchUserPoints = async () => {
    try {
      setIsLoading(true);
      // Use public rewards endpoint: GET /rewards?email=you@example.com
      const encodedUser = encodeURIComponent(userIdentifier);
      const url = `${ADMIN_API_BASE}/rewards?email=${encodedUser}&_=${Date.now()}`; // cache-bust
      console.debug('[ShakeDashboard] fetching rewards from', url);
      const response = await fetch(url);

      if (response.ok) {
        const data = await response.json();
        console.debug('[ShakeDashboard] rewards response', data);
        setLastFetchStatus(response.status);
        try { setLastFetchRaw(JSON.stringify(data, null, 2)); } catch(e){ setLastFetchRaw(String(data)); }

        // Tolerant parsing: backend may return nested user object or different keys
        // Some backends use `points` to represent available/unclaimed points — treat that as available when present.
        const available = data.availablePoints ?? data.available ?? data.unclaimed ?? data.points ?? (data.user && (data.user.availablePoints ?? data.user.available ?? data.user.points)) ?? 0;
        const total = data.totalPoints ?? data.total ?? (data.user && (data.user.totalPoints ?? data.user.total)) ?? 0;

        setAvailablePoints(Number(available) || 0);
        setTotalPoints(Number(total) || 0);
        setLastUpdated(new Date());
      } else {
        console.warn('[ShakeDashboard] Failed to fetch points (non-OK). Status:', response.status);
        setLastFetchStatus(response.status);
        setLastFetchRaw(null);
        setAvailablePoints(0);
        setTotalPoints(0);
      }
    } catch (error) {
      console.error('[ShakeDashboard] Error fetching points:', error);
      // Fallback to default values if admin backend is not available
      setAvailablePoints(0);
      setTotalPoints(0);
    } finally {
      setIsLoading(false);
    }
  };

  // Polling to check for point updates from admin
  useEffect(() => {
    // Initial fetch
    fetchUserPoints();

  // Poll every 5 seconds for updates (shortened for debugging)
  const interval = setInterval(fetchUserPoints, 5000);

    return () => clearInterval(interval);
  }, [userIdentifier]);

  // Claim points via shake (updates backend)
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
      const data = JSON.parse(lastFetchRaw);
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
    
    // Add vibration feedback
    if (navigator.vibrate) {
      navigator.vibrate([100, 30, 100, 30, 100]);
    }
    
    try {
      const encodedUser = encodeURIComponent(userIdentifier);
      // Claim points via public endpoint: POST /shake { email, pointsToClaim }
      const pointsToClaim = typeof pointsToClaimOverride === 'number'
        ? pointsToClaimOverride
        : (claimAmount === 'all' ? availablePoints : Number(claimAmount));

      const response = await fetch(`${ADMIN_API_BASE}/shake`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: userIdentifier, pointsToClaim })
      });

      if (response.ok) {
        const data = await response.json();
        // Expect backend to return structure: { pointsClaimed, newTotalPoints, availablePoints }
        setTotalPoints(data.newTotalPoints || totalPoints + (data.pointsClaimed || 0));
        setAvailablePoints(data.availablePoints || 0);
        setLastUpdated(new Date());

        setTimeout(() => {
          setIsShaking(false);
          const reward = mapReward(data.pointsClaimed);
          alert(`🎉 Points Claimed!\n💰 +${data.pointsClaimed} points\n📦 Reward: ${reward}\n📊 Total: ${data.newTotalPoints} points`);
        }, 1500);
      } else {
        throw new Error('Failed to claim points');
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
          <button className="refresh-btn" onClick={() => { fetchUserPoints(); }}>Refresh now</button>
        </div>
        <div className="admin-link">
          <p>📋 Points are managed by admins at: 
            <a href={ADMIN_API_BASE} target="_blank" rel="noopener noreferrer">
              Admin Dashboard
            </a>
          </p>
          <p className="admin-endpoints">Public endpoints: <code>POST /trade</code>, <code>POST /share</code>, <code>POST /shake</code>, <code>GET /rewards?email=</code></p>
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

        {/* Debug / Info panel (helps diagnose syncing issues) */}
        <div className="action-section">
          <h3>ℹ️ Info</h3>
          <div className="admin-info">
            <div className="info-card">
              <div className="info-content">
                <h4>Sync Diagnostics</h4>
                <p>Auto-refreshes every 5 seconds. Use the "Refresh now" button to force a fetch.</p>
                <p>Last fetch status: {lastFetchStatus ?? 'n/a'}</p>
              </div>
            </div>
            <div className="refresh-info">
              <div style={{ width: '100%', maxWidth: 800, margin: '8px auto' }}>
                <details>
                  <summary style={{ cursor: 'pointer' }}>View last raw response</summary>
                  <pre style={{ whiteSpace: 'pre-wrap', textAlign: 'left', background: 'rgba(0,0,0,0.6)', padding: 12, borderRadius: 8, color: '#fff' }}>
                    {lastFetchRaw ?? 'No response captured yet.'}
                  </pre>
                </details>
              </div>
            </div>
          </div>
        </div>

      {/* Shake Section */}
      <div className="shake-section">
        <div className="shake-container">
          <div className="shake-info">
            <h3>📱 Shake or Tap to Claim Points</h3>
            <p>Claim points that have been added by admins by shaking your phone or tapping below!</p>
            <div className="points-status">
              {availablePoints > 0 ? (
                <span className="points-ready">
                  {availablePoints} points ready to claim!
                </span>
              ) : (
                <span className="points-none">
                  No points to claim. Wait for admin to add points!
                </span>
              )}
            </div>
            <div className="shake-status">
              {isShaking ? (
                <span className="status-shaking">Claiming points...</span>
              ) : availablePoints > 0 ? (
                <span className="status-ready">Ready to claim!</span>
              ) : (
                <span className="status-waiting">Waiting for admin points...</span>
              )}
            </div>
            <div className="claim-controls">
              <label htmlFor="claimAmount">Claim amount:</label>
              <select id="claimAmount" value={claimAmount} onChange={(e) => setClaimAmount(e.target.value)}>
                <option value="all">Claim All ({availablePoints})</option>
                <option value="1">1</option>
                <option value="2">2</option>
                <option value="5">5</option>
              </select>
            </div>
          </div>
          
          {/* Interactive phone icon */}
          <div 
            className={`interactive-phone ${isShaking ? 'shaking' : ''} ${availablePoints === 0 ? 'disabled' : ''}`}
            onClick={() => {
              if (!isShaking && availablePoints > 0) {
                handleShake();
              }
            }}
          >
            <div className="phone-icon-large">📱</div>
            <div className="tap-hint">
              {availablePoints === 0 ? 'Wait for Points!' :
               isShaking ? 'Claiming...' : 'Tap or Shake!'}
            </div>
          </div>
          <div style={{ textAlign: 'center', marginTop: 8 }}>
            <button className="shake-btn" onClick={() => handleShake()} disabled={isShaking || availablePoints === 0}>Claim</button>
          </div>
        </div>
      </div>

      {/* Recent Activity */}
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
          <p>🔄 Activity data will be loaded from admin backend...</p>
          <p>Check the <a href={ADMIN_API_BASE} target="_blank" rel="noopener noreferrer">Admin Dashboard</a> to manage points.</p>
        </div>
      </div>
      {/* Floating Help Button is rendered via portal to document.body to avoid transform/stacking issues */}
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