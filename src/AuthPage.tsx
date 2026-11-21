import { useState } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'

type Props = { supabase: SupabaseClient; onSkip: () => void }

// Sign in / sign up with email + password. Supabase keeps the session on this device, so this page only
// shows until the first sign-in (or until the user chooses to use the app without an account).
export function AuthPage({ supabase, onSkip }: Props) {
  const [mode, setMode] = useState<'signin' | 'signup'>('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [again, setAgain] = useState('')
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState('')
  const mismatch = mode === 'signup' && again.length > 0 && again !== password
  const ready = email.includes('@') && password.length >= 6 && (mode === 'signin' || again === password)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setNote('')
    try {
      const creds = { email: email.trim(), password }
      const { data, error } = mode === 'signup' ? await supabase.auth.signUp(creds) : await supabase.auth.signInWithPassword(creds)
      if (error) setNote(`${mode === 'signup' ? '注册' : '登录'}失败：${error.message}`)
      else if (mode === 'signup' && !data.session) setNote('注册成功。这个项目开着邮箱验证：去邮箱点确认链接后再登录。')
      // On success Supabase fires onAuthStateChange and App leaves this page.
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="auth no-print">
      {/* Macaron colour blobs drifting behind the card, plus a few slow-floating notes. */}
      <div className="auth-bg" aria-hidden>
        <i />
        <i />
        <i />
        <i />
        <i />
        {['♪', '♫', '♩', '♬', '♪', '♫'].map((n, k) => (
          <b key={k}>{n}</b>
        ))}
      </div>
      <form className="box auth-card" onSubmit={submit}>
        <div className="auth-logo">
          <span>うたまな</span>
          <small>Utamana · 跟着唱，学日语歌</small>
        </div>
        <p className="hint">登录后歌曲、歌词和音频会在你的设备之间同步。</p>
        <div className="seg">
          <button type="button" className={mode === 'signin' ? 'on' : ''} onClick={() => (setMode('signin'), setNote(''))}>
            登录
          </button>
          <button type="button" className={mode === 'signup' ? 'on' : ''} onClick={() => (setMode('signup'), setNote(''))}>
            注册
          </button>
        </div>
        <input type="email" autoComplete="email" autoFocus placeholder="邮箱" value={email} onChange={(e) => setEmail(e.target.value)} />
        <input type="password" autoComplete={mode === 'signup' ? 'new-password' : 'current-password'} placeholder="密码（至少 6 位）" value={password} onChange={(e) => setPassword(e.target.value)} />
        {mode === 'signup' && <input type="password" autoComplete="new-password" placeholder="再输一次密码" value={again} onChange={(e) => setAgain(e.target.value)} />}
        {mismatch && <p className="hint">两次密码不一样</p>}
        <button type="submit" className="primary" disabled={busy || !ready}>
          {busy ? '请稍候…' : mode === 'signup' ? '注册并登录' : '登录'}
        </button>
        {note && <p className="hint">{note}</p>}
        <button type="button" className="link" onClick={onSkip}>
          先不登录，只在这台设备上用
        </button>
      </form>
    </main>
  )
}
