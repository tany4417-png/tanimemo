import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './styles.css'
import App from './App.tsx'

// ピンチズーム無効化（アプリ型UI。viewportメタとCSS touch-actionに加えた保険。
// iOS SafariはgesturestartのpreventDefaultでピンチを止められる）
document.addEventListener('gesturestart', (e) => e.preventDefault())
document.addEventListener(
  'touchmove',
  (e) => {
    if (e.touches.length > 1) e.preventDefault()
  },
  { passive: false }
)

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
