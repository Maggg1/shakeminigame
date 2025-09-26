import React, { useEffect, useRef } from 'react';
import './RewardModal.css';
import levelUpSfx from '../audio/level-up-08-402152.mp3';

export default function RewardModal({ open, onClose, redemption }) {
  const playedRef = useRef(false);
  useEffect(() => {
    if (open && redemption && !playedRef.current) {
      playedRef.current = true;
      try { const a = new Audio(levelUpSfx); a.play().catch(() => {}); } catch(e) {}
    }
    if (!open) playedRef.current = false;
  }, [open, redemption]);

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
