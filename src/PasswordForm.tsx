import { useState } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'

type Props = { supabase: SupabaseClient; submitLabel?: string; onDone?: () => void }

// New password + confirmation for the signed-in user (settings, or after a password-reset link).
export function PasswordForm({ supabase, submitLabel = '修改密码', onDone }: Props) {
  const [password, setPassword] = useState('')
  const [again, setAgain] = useState('')
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState('')
  const ready = password.length >= 6 && again === password

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setNote('')
    try {
      const { error } = await supabase.auth.updateUser({ password })
      if (error) return setNote(`修改失败：${error.message}`)
      setPassword('')
      setAgain('')
      setNote('密码已更新')
      onDone?.()
    } finally {
      setBusy(false)
    }
  }

  return (
    <form className="password-form" onSubmit={submit}>
      <input type="password" autoComplete="new-password" placeholder="新密码（至少 6 位）" value={password} onChange={(e) => setPassword(e.target.value)} />
      <input type="password" autoComplete="new-password" placeholder="再输一次新密码" value={again} onChange={(e) => setAgain(e.target.value)} />
      {again.length > 0 && again !== password && <p className="hint">两次密码不一样</p>}
      <button type="submit" className="primary" disabled={busy || !ready}>
        {busy ? '请稍候…' : submitLabel}
      </button>
      {note && <p className="hint">{note}</p>}
    </form>
  )
}
