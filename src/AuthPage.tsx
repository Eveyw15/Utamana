import { useState } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'
import { PasswordForm } from './PasswordForm'

// recovery: the user arrived from a password-reset email and is signed in; ask for the new password.
type Props = { supabase: SupabaseClient; onSkip: () => void; recovery?: boolean; onRecovered?: () => void }

// Sign in / sign up with email + password. Supabase keeps the session on this device, so this page only
// shows until the first sign-in (or until the user chooses to use the app without an account).
export function AuthPage({ supabase, onSkip, recovery, onRecovered }: Props) {
  const [mode, setMode] = useState<'signin' | 'signup' | 'forgot'>('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [again, setAgain] = useState('')
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState('')
  const mismatch = mode === 'signup' && again.length > 0 && again !== password
  const ready = email.includes('@') && (mode === 'forgot' || (password.length >= 6 && (mode === 'signin' || again === password)))

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setNote('')
    try {
      if (mode === 'forgot') {
        // The link in the mail signs the user in and brings them back here to set a new password.
        const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: location.origin })
        setNote(error ? `发送失败：${error.message}` : '重置密码的邮件已发送，点邮件里的链接回来设置新密码。')
        return
      }
      const creds = { email: email.trim(), password }
      const { data, error } = mode === 'signup' ? await supabase.auth.signUp(creds) : await supabase.auth.signInWithPassword(creds)
      if (error) setNote(`${mode === 'signup' ? '注册' : '登录'}失败：${error.message}`)
      else if (mode === 'signup' && !data.session) setNote('注册成功~一封验证邮件已发送到你的邮箱，快去确认吧！')
      // On success Supabase fires onAuthStateChange and App leaves this page.
    } finally {
      setBusy(false)
    }
  }

  const bg = (
    <div className="auth-bg" aria-hidden>
      <i />
      <i />
      <i />
    </div>
  )

  if (recovery)
    return (
      <main className="auth no-print">
        {bg}
        <div className="box auth-card">
          <div className="auth-logo">
            <span>设置新密码</span>
            <small>Utamana</small>
          </div>
          <PasswordForm supabase={supabase} submitLabel="保存新密码" onDone={onRecovered} />
        </div>
      </main>
    )

  return (
    <main className="auth no-print">
      {bg}
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
        {mode !== 'forgot' && (
          <input type="password" autoComplete={mode === 'signup' ? 'new-password' : 'current-password'} placeholder="密码（至少 6 位）" value={password} onChange={(e) => setPassword(e.target.value)} />
        )}
        {mode === 'signup' && <input type="password" autoComplete="new-password" placeholder="再输一次密码" value={again} onChange={(e) => setAgain(e.target.value)} />}
        {mismatch && <p className="hint">两次密码不一样</p>}
        <button type="submit" className="primary" disabled={busy || !ready}>
          {busy ? '请稍候…' : mode === 'signup' ? '注册并登录' : mode === 'forgot' ? '发送重置邮件' : '登录'}
        </button>
        {note && <p className="hint">{note}</p>}
        {mode === 'signin' && (
          <button type="button" className="link" onClick={() => (setMode('forgot'), setNote(''))}>
            忘记密码？
          </button>
        )}
        {mode === 'forgot' && (
          <button type="button" className="link" onClick={() => (setMode('signin'), setNote(''))}>
            想起来了，返回登录
          </button>
        )}
        <button type="button" className="link" onClick={onSkip}>
          先不登录，只在这台设备上用
        </button>
      </form>
    </main>
  )
}
