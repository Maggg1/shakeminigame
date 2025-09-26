import React, { useEffect, useRef } from 'react';
import './RewardModal.css';
import levelUpSfx from '../audio/level-up-08-402152.mp3';

export default function RewardModal({ open, onClose, redemption }) {
  const playedRef = useRef(false);
  const audioRef = useRef(null);
  const modalRef = useRef(null);
  const previouslyFocused = useRef(null);

  // Preload the audio once on mount
  useEffect(() => {
    try {
      audioRef.current = new Audio(levelUpSfx);
      audioRef.current.preload = 'auto';
      // load may be a noop in some browsers but it's fine to call
      audioRef.current.load();
    } catch (e) {
      audioRef.current = null;
    }
  }, []);

  // Play level-up SFX only when a concrete redemption is present.
  useEffect(() => {
    if (open && redemption && !playedRef.current) {
      playedRef.current = true;
      try {
        const a = audioRef.current || new Audio(levelUpSfx);
        a.currentTime = 0;
        a.play().catch(() => {});
      } catch (e) {}
    }
    if (!open) playedRef.current = false;
  }, [open, redemption]);

  // Keyboard: Escape to close & simple focus trap for accessibility
  useEffect(() => {
    if (!open) return;

    previouslyFocused.current = document.activeElement;

    const focusableSelector = 'a[href], area[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), button:not([disabled]), iframe, [tabindex]:not([tabindex="-1"])';
    const modalNode = modalRef.current;
    const focusable = modalNode ? Array.from(modalNode.querySelectorAll(focusableSelector)) : [];
    if (focusable.length) focusable[0].focus();

    const onKeyDown = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose && onClose();
        return;
      }
      if (e.key === 'Tab' && modalNode) {
        // Simple focus trap: keep focus inside modal
        const focusableEls = Array.from(modalNode.querySelectorAll(focusableSelector)).filter(el => el.offsetParent !== null);
        if (focusableEls.length === 0) {
          e.preventDefault();
          return;
        }
        const first = focusableEls[0];
        const last = focusableEls[focusableEls.length - 1];
        if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        } else if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        }
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      try { previouslyFocused.current && previouslyFocused.current.focus(); } catch (e) {}
    };
  }, [open, onClose]);

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

  // If redemption is not provided yet, show a gentle in-progress fallback so users always see a modal while redeeming.
  // Note: visual close controls were intentionally removed; the modal can still be dismissed with Escape for accessibility.
  return (
    <div className="rm-overlay">
      <div ref={modalRef} className="rm-modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        <button className="rm-close" onClick={onClose} aria-label="Close">✕</button>
        <div className="rm-body">
          <h3 className="rm-title">{redemption ? `🎉 ${title}` : '🎉 Redeeming…'}</h3>
          {redemption ? (
            description && <p className="rm-desc">{description}</p>
          ) : (
            <p className="rm-desc">Redeeming your reward… this will be confirmed shortly.</p>
          )}
          {/* Close buttons intentionally removed; keep Escape key to close */}
        </div>
      </div>
    </div>
  );
}
