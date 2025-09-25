import React from 'react';
import './RewardModal.css';

export default function RewardModal({ open, onClose, redemption }) {
  if (!open || !redemption) return null;
  const r = redemption;
  const rewardDef = r.rewardDef || {};
  const title = rewardDef.title || (r.claim && r.claim.title) || 'Reward';
  const description = rewardDef.description || rewardDef.desc || r.message || '';
  const tier = r.tier || rewardDef.tier || '';
  const cost = r.cost != null ? r.cost : (rewardDef.pointsRequired ?? rewardDef.cost ?? '–');
  const claimId = (r.claim && (r.claim.id || r.claim._id || r.claim.claimId)) || '';
  const newPoints = r.newPoints ?? r.points ?? null;

  return (
    <div className="rm-overlay" onClick={onClose}>
      <div className="rm-modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        <button className="rm-close" onClick={onClose} aria-label="Close">✕</button>
        <div className="rm-body">
          <h3 className="rm-title">🎉 {title}</h3>
          {description && <p className="rm-desc">{description}</p>}
          <div className="rm-details">
            <div><strong>Tier</strong>: {tier || '—'}</div>
            <div><strong>Cost</strong>: {cost != null ? cost : '—'}</div>
            {claimId && <div><strong>Claim ID</strong>: {claimId}</div>}
            {newPoints != null && <div><strong>New Balance</strong>: {newPoints} pts</div>}
          </div>
          <div className="rm-actions">
            <button className="rm-ok" onClick={onClose}>Close</button>
          </div>
        </div>
      </div>
    </div>
  );
}
