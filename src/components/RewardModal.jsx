import React, { useEffect, useRef } from 'react';
import './RewardModal.css';
import levelUpSfx from '../audio/level-up-08-402152.mp3';

export default function RewardModal({ open, onClose, redemption }) {
  const playedRef = useRef(false);

  // Play level-up SFX only when a concrete redemption is present.
  useEffect(() => {
    if (open && redemption && !playedRef.current) {
      playedRef.current = true;
      try { const a = new Audio(levelUpSfx); a.play().catch(() => {}); } catch(e) {}
    }
    if (!open) playedRef.current = false;
  }, [open, redemption]);

  // If the modal isn't open, don't render anything.
  if (!open) return null;

  // Be defensive when resolution of the redemption shape varies between server and client.
  const r = redemption || {};
  const rewardDef = r.rewardDef || r.claim || {};
  const title = (
    rewardDef.title || rewardDef.name || r.title || r.rewardName || r.prize || r.label || 'Reward'
  );
  const description = (
    rewardDef.description || rewardDef.desc || r.message || r.note || ''
  );

  // If redemption is not provided yet, show a gentle in-progress fallback so users always see a modal after shaking.
  return (
    <div className="rm-overlay" onClick={onClose}>
      <div className="rm-modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        <button className="rm-close" onClick={onClose} aria-label="Close">✕</button>
        <div className="rm-body">
          <h3 className="rm-title">{redemption ? `🎉 ${title}` : '🎉 Reward claimed'}</h3>
          {redemption ? (
            description && <p className="rm-desc">{description}</p>
          ) : (
            <p className="rm-desc">Processing your claim… it will be confirmed shortly.</p>
          )}
          <div className="rm-actions">
            <button className="rm-ok" onClick={onClose}>Close</button>
          </div>
        </div>
      </div>
    </div>
  );
}
