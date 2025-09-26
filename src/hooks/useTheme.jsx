import React, { createContext, useContext, useState, useEffect } from 'react';

const ThemeContext = createContext();

export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
};

export const ThemeProvider = ({ children }) => {
  const [isDarkMode, setIsDarkMode] = useState(true);

  // Load theme preference from localStorage on mount
  useEffect(() => {
    const savedTheme = localStorage.getItem('theme');
    if (savedTheme) {
      setIsDarkMode(savedTheme === 'dark');
    }
  }, []);

  // Save theme preference to localStorage whenever it changes
  // and apply the corresponding body class without clobbering other classes.
  useEffect(() => {
    const themeValue = isDarkMode ? 'dark' : 'light';
    try { localStorage.setItem('theme', themeValue); } catch(e) {}

    try {
      // Use classList to avoid overwriting any other body classes
      document.body.classList.remove(isDarkMode ? 'light-theme' : 'dark-theme');
      document.body.classList.add(isDarkMode ? 'dark-theme' : 'light-theme');
    } catch (e) {
      try { document.body.className = isDarkMode ? 'dark-theme' : 'light-theme'; } catch(e) {}
    }

    // Listen for storage events to sync theme across tabs/windows
    const onStorage = (ev) => {
      if (!ev.key) return;
      if (ev.key === 'theme') {
        const newVal = ev.newValue;
        if (newVal === 'dark') setIsDarkMode(true);
        if (newVal === 'light') setIsDarkMode(false);
      }
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, [isDarkMode]);

  const toggleTheme = () => {
    setIsDarkMode(!isDarkMode);
  };

  const value = {
    isDarkMode,
    toggleTheme,
    theme: isDarkMode ? 'dark' : 'light'
  };

  return (
    <ThemeContext.Provider value={value}>
      {children}
    </ThemeContext.Provider>
  );
};