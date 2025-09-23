import React from 'react';
import { useTheme } from '../hooks/useTheme.jsx';
import './ThemeToggle.css';

export const ThemeToggle = () => {
  const { isDarkMode, toggleTheme } = useTheme();

  return (
    <button
      className="theme-toggle"
      onClick={toggleTheme}
      title={`Switch to ${isDarkMode ? 'light' : 'dark'} mode`}
    >
      <span className="theme-icon">
        {isDarkMode ? '☀️' : '🌙'}
      </span>
    </button>
  );
};