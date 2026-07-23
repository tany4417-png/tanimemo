import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './styles.css'
import App from './App.tsx'
import { applyInviteOnBoot, watchInviteHash } from './lib/invite.ts'

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

// AppがlocalStorageのトークンをuseState初期値で読むため、招待リンクの適用は
// レンダー開始前に済ませる（失敗してもアプリ自体は通常起動させる）
watchInviteHash()
applyInviteOnBoot({
  confirmOverwrite: () =>
    window.confirm('この端末には既にトークンが設定されています。招待リンクのトークンで上書きしますか？'),
})
  .then((result) => {
    if (result === 'failed') {
      alert('トークンを保存できませんでした。プライベートブラウズを解除して、もう一度招待リンクを開いてください。')
    }
  })
  .catch(() => {})
  .finally(() => {
    createRoot(document.getElementById('root')!).render(
      <StrictMode>
        <App />
      </StrictMode>,
    )
  })
