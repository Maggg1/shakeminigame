import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { ThemeProvider } from './hooks/useTheme.jsx'
import { HashRouter, Routes, Route } from 'react-router-dom'
import ShakePage from './pages/ShakePage'

// Small global toast helper so existing showToast(...) calls work from anywhere.
// Use inline styles so the toast appears regardless of surrounding selectors.
if (typeof window !== 'undefined') {
  window.showToast = function(title, body, duration = 4000) {
    try {
      let el = document.getElementById('global-claim-toast');
      if (!el) {
        el = document.createElement('div');
        el.id = 'global-claim-toast';
        el.style.position = 'fixed';
        el.style.left = '50%';
        el.style.top = '20px';
        el.style.transform = 'translateX(-50%)';
        el.style.background = 'rgba(20,20,20,0.9)';
        el.style.color = '#fff';
        el.style.padding = '12px 18px';
        el.style.borderRadius = '12px';
        el.style.boxShadow = '0 8px 32px rgba(0,0,0,0.6)';
        el.style.zIndex = '9999';
        el.style.minWidth = '260px';
        el.style.display = 'flex';
        el.style.gap = '12px';
        el.style.alignItems = 'center';
        el.style.opacity = '0';
        el.style.transition = 'all 0.25s ease';
        el.innerHTML = `<div class="toast-content" style="display:flex;flex-direction:column;"><div class="toast-title" style="font-weight:700;margin-bottom:4px"></div><div class="toast-body" style="font-size:0.95rem;opacity:0.95"></div></div>`;
        document.body.appendChild(el);
      }
      const titleEl = el.querySelector('.toast-title');
      const bodyEl = el.querySelector('.toast-body');
      if (titleEl) titleEl.textContent = title || '';
      if (bodyEl) bodyEl.textContent = body || '';
      // show
      el.style.opacity = '1';
      // reset any previous timer
      if (el.__toastTimer) clearTimeout(el.__toastTimer);
      el.__toastTimer = setTimeout(() => {
        el.style.opacity = '0';
      }, duration);
    } catch (e) { /* ignore */ }
  };
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ThemeProvider>
      <HashRouter>
        <Routes>
          <Route path="/" element={<App />} />
          <Route path="/shake" element={<ShakePage />} />
        </Routes>
      </HashRouter>
    </ThemeProvider>
  </StrictMode>,
)
