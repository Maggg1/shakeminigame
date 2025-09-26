import React from 'react';
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
        <header className="app-header">
          <div className="header-content">
            <div className="app-title">
              <h1><img src={walrusImg} alt="walrus" className="walrus-header-img" /> Shake Rewards</h1>
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