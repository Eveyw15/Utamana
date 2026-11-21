import { useState } from 'react'

type Props = { values?: string[]; options: string[]; onChange: (v: string[]) => void; newLabel?: string }

// Tags / playlists: every known value is a chip to click on or off; typing is only for a new one.
export function ChipsPicker({ values = [], options, onChange, newLabel = '＋ 新建' }: Props) {
  const [adding, setAdding] = useState(false)
  const [draft, setDraft] = useState('')
  const all = [...new Set([...options, ...values])]
  const add = () => {
    const t = draft.trim()
    setDraft('')
    setAdding(false)
    if (t && !values.includes(t)) onChange([...values, t])
  }
  return (
    <div className="chips">
      {all.map((t) => (
        <button key={t} className={`chip ${values.includes(t) ? 'on' : ''}`} onClick={() => onChange(values.includes(t) ? values.filter((x) => x !== t) : [...values, t])}>
          {t}
        </button>
      ))}
      {adding ? (
        <input
          className="chip-input"
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            // isComposing: Enter that confirms an IME (pinyin / kana) candidate must not add the chip yet
            if (e.nativeEvent.isComposing) return
            if (e.key === 'Escape') return setAdding(false)
            if (e.key !== 'Enter' && e.key !== ',' && e.key !== '，') return
            e.preventDefault()
            add()
          }}
          onBlur={add}
        />
      ) : (
        <button className="chip add" onClick={() => setAdding(true)}>
          {newLabel}
        </button>
      )}
    </div>
  )
}
