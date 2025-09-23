import React from 'react';
import './App.css';
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
              <h1>📱 Shake Rewards</h1>
              <p className="subtitle">Shake to earn coins daily!</p>
            </div>
            <div className="user-info">
              <div className="user-details">
                <span className="phone-display">� {email}</span>
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