import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { ThemeProvider } from './hooks/useTheme.jsx'
import { HashRouter, Routes, Route } from 'react-router-dom'
import ShakePage from './pages/ShakePage'

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
