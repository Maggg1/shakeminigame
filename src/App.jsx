import React, { useRef, useEffect } from 'react';
import './App.css';
import walrusImg from './assets/walrus.png';
import { useAuth } from './hooks/useAuth';
import { EmailLogin } from './components/EmailLogin';
import { ShakeDashboard } from './components/ShakeDashboard';
import { ThemeToggle } from './components/ThemeToggle';

function App() {
  const { 
    isAuthenticated, 
    email, // Changed from phoneNumber to email
    login, 
    logout, 
    loading: authLoading,
    getDisplayName
  } = useAuth();

  // refs and drag state for the walrus header image
  const walrusRef = useRef(null);
  const headerRef = useRef(null);
  const dragStateRef = useRef({ dragging: false, startX: 0, startY: 0, origLeft: 0, origTop: 0 });

  useEffect(() => {
    // ensure walrus has position style we can manipulate
    const w = walrusRef.current;
    if (w) {
      w.style.touchAction = 'none';
      w.style.cursor = 'grab';
    }
  }, []);

  const handlePointerDown = (ev) => {
    const w = walrusRef.current;
    const h = headerRef.current;
    if (!w || !h) return;
    ev.preventDefault();
    w.setPointerCapture(ev.pointerId);
    const rect = w.getBoundingClientRect();
    const headerRect = h.getBoundingClientRect();
    dragStateRef.current = {
      dragging: true,
      startX: ev.clientX,
      startY: ev.clientY,
      origLeft: rect.left - headerRect.left,
      origTop: rect.top - headerRect.top,
      headerRect,
      elemRect: rect
    };
    try { w.style.cursor = 'grabbing'; } catch (e) {}
  };

  const handlePointerMove = (ev) => {
    const w = walrusRef.current;
    const state = dragStateRef.current;
    if (!w || !state.dragging) return;
    ev.preventDefault();
    const dx = ev.clientX - state.startX;
    const dy = ev.clientY - state.startY;
    let newLeft = state.origLeft + dx;
    let newTop = state.origTop + dy;
    // constrain within headerRect
    const hRect = state.headerRect;
    const eRect = state.elemRect;
    const maxLeft = hRect.width - eRect.width;
    const maxTop = hRect.height - eRect.height;
    if (newLeft < 0) newLeft = 0;
    if (newTop < 0) newTop = 0;
    if (newLeft > maxLeft) newLeft = maxLeft;
    if (newTop > maxTop) newTop = maxTop;
    w.style.position = 'absolute';
    w.style.left = newLeft + 'px';
    w.style.top = newTop + 'px';
  };

  const handlePointerUp = (ev) => {
    const w = walrusRef.current;
    const state = dragStateRef.current;
    if (!w || !state.dragging) return;
    try { w.releasePointerCapture(ev.pointerId); } catch (e) {}
    dragStateRef.current.dragging = false;
    try { w.style.cursor = 'grab'; } catch (e) {}
  };

  // Touch fallback for older mobile browsers that don't fully support Pointer Events
  const handleTouchStart = (ev) => {
    if (!ev || !ev.touches || ev.touches.length === 0) return;
    const t = ev.touches[0];
    // create a synthetic event shape for the pointer handlers
    const synth = {
      clientX: t.clientX,
      clientY: t.clientY,
      pointerId: t.identifier,
      preventDefault() { try { ev.preventDefault(); } catch(e) {} }
    };
    handlePointerDown(synth);
  };

  const handleTouchMove = (ev) => {
    if (!ev || !ev.touches || ev.touches.length === 0) return;
    const t = ev.touches[0];
    const synth = { clientX: t.clientX, clientY: t.clientY, preventDefault() { try { ev.preventDefault(); } catch(e) {} } };
    handlePointerMove(synth);
  };

  const handleTouchEnd = (ev) => {
    // use changedTouches for the final position
    if (!ev || !ev.changedTouches || ev.changedTouches.length === 0) return;
    const t = ev.changedTouches[0];
    const synth = { clientX: t.clientX, clientY: t.clientY, pointerId: t.identifier, preventDefault() { try { ev.preventDefault(); } catch(e) {} } };
    handlePointerUp(synth);
  };

  const handleLoginSuccess = (email) => {
    login(email);
  };

  const handleLogout = () => {
    logout();
  };

  if (authLoading) {
    return (
      <div className="app loading">
        <div className="loading-container">
          <div className="loading-spinner"></div>
          <p>Loading...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="app login-required">
        <EmailLogin onLoginSuccess={handleLoginSuccess} />
      </div>
    );
  }

  return (
    <div className="app authenticated">
      <div className="app-container">
        <header className="app-header" ref={headerRef}>
          <div className="header-content">
            <div className="app-title">
              <h1>
                <img
                  src={walrusImg}
                  alt="walrus"
                  className="walrus-header-img"
                  ref={walrusRef}
                  onPointerDown={handlePointerDown}
                  onPointerMove={handlePointerMove}
                  onPointerUp={handlePointerUp}
                  onTouchStart={handleTouchStart}
                  onTouchMove={handleTouchMove}
                  onTouchEnd={handleTouchEnd}
                />
                Shake Rewards
              </h1>
              <p className="subtitle">{(typeof getDisplayName === 'function' && getDisplayName()) ? <span className="user-display-name">{getDisplayName()}</span> : email}</p>
            </div>
            <div className="user-info">
              <div className="user-details">
                {/* show a visible badge for the logged-in user (always on top) */}
                <div className="user-badge">{(typeof getDisplayName === 'function' && getDisplayName()) || email}</div>
                <div className="header-controls">
                  <ThemeToggle />
                  <button 
                    className="logout-btn"
                    onClick={handleLogout}
                    title="Logout"
                  >
                    🚪
                  </button>
                </div>
              </div>
            </div>
          </div>
        </header>
        
        <main className="main-content">
          <ShakeDashboard phoneNumber={email} />
        </main>
      </div>
    </div>
  );
}

export default App;