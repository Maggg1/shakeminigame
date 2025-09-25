// Points and Rewards System
import { API } from '../config/api';

export class PointsSystem {
  constructor(phoneNumber) {
    this.phoneNumber = phoneNumber;
    this.storageKey = `pointsData_${phoneNumber}`;
    this.loadData();
  }

  loadData() {
    const saved = localStorage.getItem(this.storageKey);
    if (saved) {
      const data = JSON.parse(saved);
      this.totalPoints = data.totalPoints || 0;
      this.availablePoints = data.availablePoints || 0; // Points ready to claim
      this.actionHistory = data.actionHistory || [];
      this.claimHistory = data.claimHistory || [];
    } else {
      this.totalPoints = 0;
      this.availablePoints = 0;
      this.actionHistory = [];
      this.claimHistory = [];
    }
  }

  saveData() {
    const data = {
      totalPoints: this.totalPoints,
      availablePoints: this.availablePoints,
      actionHistory: this.actionHistory,
      claimHistory: this.claimHistory
    };
    localStorage.setItem(this.storageKey, JSON.stringify(data));
  }

  getRewardLadder() {
    return [
      { points: 1, reward: 'RM1 Credit', type: 'credit', value: 1 },
      { points: 10, reward: 'RM5 Voucher', type: 'voucher', value: 5 },
      { points: 25, reward: 'RM15 Voucher', type: 'voucher', value: 15 },
      {
        points: 50,
        reward: 'RM40 Voucher OR Digital Badge',
        type: 'choice',
        choices: [
          { name: 'RM40 Voucher', type: 'voucher', value: 40 },
          { name: 'Digital Badge', type: 'badge', value: 'exclusive' }
        ]
      },
      { points: 100, reward: 'Physical Plushie', type: 'physical', value: 'plushie' }
    ];
  }

  // Add points from actions
  addPointsFromAction(actionType, details = {}) {
    let points = 0;
    let description = '';

    switch (actionType) {
      case 'trade':
        points = 1;
        description = `Trade executed: ${details.pair || 'BTC/USD'}`;
        break;
      case 'share':
        points = 2;
        description = `Shared ${details.content || 'app'} on social media`;
        break;
      default:
        return null;
    }

    // If backend API is present, notify it (with token if available)
    if (API) {
      const payload = { email: this.phoneNumber, action: actionType, details };
      const endpoint = actionType === 'trade' ? '/trade' : '/share';
      (async () => {
        try {
          let token = null;
          try {
            const { getAuth } = await import('firebase/auth');
            const a = getAuth();
            if (a.currentUser) token = await a.currentUser.getIdToken();
          } catch (e) {
            token = null;
          }
          const headers = token
            ? { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }
            : { 'Content-Type': 'application/json' };
          await fetch(`${API}${endpoint}`, {
            method: 'POST',
            headers,
            body: JSON.stringify(payload),
            credentials: 'include'
          });
        } catch (err) {
          console.warn('Failed to notify backend of action, continuing with local add', err);
        }
      })();
    }

    // Local update
    this.availablePoints += points;
    const action = {
      id: Date.now(),
      type: actionType,
      points: points,
      description: description,
      timestamp: new Date().toISOString(),
      details: details
    };
    this.actionHistory.unshift(action);
    if (this.actionHistory.length > 50) this.actionHistory = this.actionHistory.slice(0, 50);
    this.saveData();
    return action;
  }

  // Claim points. By default claim a single point per call. Pass pointsToClaim to claim more.
  claimPoints(pointsToClaim = 1) {
    if (this.availablePoints <= 0) return { success: false, message: 'No points to claim!' };
    // Ensure we don't claim more than available
    const toClaim = Math.max(0, Math.min(Number(pointsToClaim) || 1, this.availablePoints));
    if (toClaim === 0) return { success: false, message: 'No points to claim!' };

    this.totalPoints += toClaim;
    this.availablePoints -= toClaim;

    const claim = {
      id: Date.now(),
      pointsClaimed: toClaim,
      totalAfterClaim: this.totalPoints,
      remainingAvailable: this.availablePoints,
      timestamp: new Date().toISOString(),
      time: new Date().toLocaleTimeString()
    };
    this.claimHistory.unshift(claim);
    if (this.claimHistory.length > 20) this.claimHistory = this.claimHistory.slice(0, 20);
    this.saveData();
    return { success: true, pointsClaimed: toClaim, totalPoints: this.totalPoints, claim };
  }

  getAvailableRewards() {
    const ladder = this.getRewardLadder();
    return ladder.filter(reward => this.totalPoints >= reward.points);
  }

  getNextReward() {
    const ladder = this.getRewardLadder();
    return ladder.find(reward => this.totalPoints < reward.points);
  }

  getProgressToNextReward() {
    const nextReward = this.getNextReward();
    if (!nextReward) return { progress: 100, isMaxed: true };
    const pointsNeeded = nextReward.points - this.totalPoints;
    const progress = (this.totalPoints / nextReward.points) * 100;
    return { progress: Math.min(progress, 100), pointsNeeded, nextReward, isMaxed: false };
  }

  getRecentClaims(limit = 10) {
    return this.claimHistory.slice(0, limit);
  }

  generateInitialActions() {
    if (this.actionHistory.length === 0) {
      const actions = [
        { type: 'trade', details: { pair: 'BTC/USD', amount: 1000 } },
        { type: 'share', details: { content: 'trading results', platform: 'Twitter' } },
        { type: 'trade', details: { pair: 'ETH/USD', amount: 500 } },
        { type: 'trade', details: { pair: 'ADA/USD', amount: 750 } },
        { type: 'share', details: { content: 'app recommendation', platform: 'Facebook' } }
      ];
      actions.forEach((action, index) => {
        const pastTime = Date.now() - ((actions.length - index) * 24 * 60 * 60 * 1000);
        const actionResult = this.addPointsFromAction(action.type, action.details);
        if (actionResult) actionResult.timestamp = new Date(pastTime).toISOString();
      });
    }
  }

  resetData() {
    localStorage.removeItem(this.storageKey);
    this.loadData();
  }
}