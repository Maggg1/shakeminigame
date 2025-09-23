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

  // Fixed reward ladder
  getRewardLadder() {
    return [
      { points: 1, reward: "RM1 Credit", type: "credit", value: 1 },
      { points: 10, reward: "RM5 Voucher", type: "voucher", value: 5 },
      { points: 25, reward: "RM15 Voucher", type: "voucher", value: 15 },
      { 
        points: 50, 
        reward: "RM40 Voucher OR Digital Badge", 
        type: "choice", 
        choices: [
          { name: "RM40 Voucher", type: "voucher", value: 40 },
          { name: "Digital Badge", type: "badge", value: "exclusive" }
        ]
      },
      { points: 100, reward: "Physical Plushie", type: "physical", value: "plushie" }
    ];
  }

  // Add points from actions
  addPointsFromAction(actionType, details = {}) {
    let points = 0;
    let description = "";

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

    // If backend API is present, POST the action so admins can grant points
    if (API) {
      const payload = {
        email: this.phoneNumber,
        action: actionType,
        details
      };

      const endpoint = actionType === 'trade' ? '/trade' : '/share';
      fetch(`${API}${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      }).catch(err => {
        console.warn('Failed to notify backend of action, continuing with local add', err);
      });
    }

    // Add to available points (ready to claim) locally for immediate UX
    this.availablePoints += points;

    // Add to action history
    const action = {
      id: Date.now(),
      type: actionType,
      points: points,
      description: description,
      timestamp: new Date().toISOString(),
      details: details
    };

    this.actionHistory.unshift(action);

    // Keep only last 50 actions
    if (this.actionHistory.length > 50) {
      this.actionHistory = this.actionHistory.slice(0, 50);
    }

    this.saveData();
    return action;
  }

  // Claim available points (triggered by shake)
  claimPoints() {
    if (this.availablePoints === 0) {
      return { success: false, message: "No points to claim!" };
    }

    const pointsToClaim = this.availablePoints;
    this.totalPoints += pointsToClaim;
    this.availablePoints = 0;

    // Add to claim history
    const claim = {
      id: Date.now(),
      pointsClaimed: pointsToClaim,
      totalAfterClaim: this.totalPoints,
      timestamp: new Date().toISOString(),
      time: new Date().toLocaleTimeString()
    };
    
    this.claimHistory.unshift(claim);
    
    // Keep only last 20 claims
    if (this.claimHistory.length > 20) {
      this.claimHistory = this.claimHistory.slice(0, 20);
    }

    this.saveData();
    
    return {
      success: true,
      pointsClaimed: pointsToClaim,
      totalPoints: this.totalPoints,
      claim: claim
    };
  }

  // Get available rewards based on current points
  getAvailableRewards() {
    const ladder = this.getRewardLadder();
    return ladder.filter(reward => this.totalPoints >= reward.points);
  }

  // Get next reward to work towards
  getNextReward() {
    const ladder = this.getRewardLadder();
    return ladder.find(reward => this.totalPoints < reward.points);
  }

  // Get progress to next reward
  getProgressToNextReward() {
    const nextReward = this.getNextReward();
    if (!nextReward) return { progress: 100, isMaxed: true };
    
    const pointsNeeded = nextReward.points - this.totalPoints;
    const progress = (this.totalPoints / nextReward.points) * 100;
    
    return {
      progress: Math.min(progress, 100),
      pointsNeeded: pointsNeeded,
      nextReward: nextReward,
      isMaxed: false
    };
  }

  // Get recent actions (last 10)
  getRecentActions(limit = 10) {
    return this.actionHistory.slice(0, limit);
  }

  // Get recent claims (last 10)
  getRecentClaims(limit = 10) {
    return this.claimHistory.slice(0, limit);
  }

  // Simulate some initial actions for new users
  generateInitialActions() {
    if (this.actionHistory.length === 0) {
      // Add some sample actions over the past few days
      const actions = [
        { type: 'trade', details: { pair: 'BTC/USD', amount: 1000 } },
        { type: 'share', details: { content: 'trading results', platform: 'Twitter' } },
        { type: 'trade', details: { pair: 'ETH/USD', amount: 500 } },
        { type: 'trade', details: { pair: 'ADA/USD', amount: 750 } },
        { type: 'share', details: { content: 'app recommendation', platform: 'Facebook' } }
      ];

      actions.forEach((action, index) => {
        // Simulate actions from past days
        const pastTime = Date.now() - ((actions.length - index) * 24 * 60 * 60 * 1000);
        const actionResult = this.addPointsFromAction(action.type, action.details);
        if (actionResult) {
          actionResult.timestamp = new Date(pastTime).toISOString();
        }
      });
    }
  }

  // Reset all data (for testing)
  resetData() {
    localStorage.removeItem(this.storageKey);
    this.loadData();
  }
}