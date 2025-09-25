import React from 'react';
import './RewardModal.css';

export default function RewardModal({ open, onClose, redemption }) {
  if (!open || !redemption) return null;
  const r = redemption;
  const rewardDef = r.rewardDef || {};
  const title = rewardDef.title || (r.claim && r.claim.title) || 'Reward';
  const description = rewardDef.description || rewardDef.desc || r.message || '';
  return (
    <div className="rm-overlay" onClick={onClose}>
      <div className="rm-modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        <button className="rm-close" onClick={onClose} aria-label="Close">✕</button>
        <div className="rm-body">
          <h3 className="rm-title">🎉 {title}</h3>
          {description && <p className="rm-desc">{description}</p>}
          <div className="rm-actions">
            <button className="rm-ok" onClick={onClose}>Close</button>
          </div>
        </div>
      </div>
    </div>
  );
}
