import { useState } from 'react'
import type { SongMeta } from './db'
import { toCover } from './cover'
import { loadPractice, practiceStats } from './practice'
import { STATUS } from './rows'

export type ProfileInfo = { nickname?: string; avatar?: string } // avatar: small square JPEG data URL

// Round avatar: the picture, or the first letter of the nickname / email on a muted circle.
export function Avatar({ profile, email, size = 32 }: { profile: ProfileInfo; email?: string | null; size?: number }) {
  const letter = [...(profile.nickname?.trim() || email || '♪')][0].toUpperCase()
  return (
    <span className="avatar" style={{ width: size, height: size, fontSize: size * 0.45 }}>
      {profile.avatar ? <img src={profile.avatar} alt="" /> : letter}
    </span>
  )
}

const mins = (s: number) => (s < 3600 ? `${Math.round(s / 60)} 分钟` : `${(s / 3600).toFixed(1)} 小时`)

type Props = { songs: SongMeta[]; email: string | null; profile: ProfileInfo; onSave: (p: ProfileInfo) => void; onSettings: () => void }

export function Profile({ songs, email, profile, onSave, onSettings }: Props) {
  const [name, setName] = useState(profile.nickname ?? '')
  const p = practiceStats(loadPractice())
  const max = Math.max(60, ...p.week.map((d) => d.seconds))
  const count = (f: (s: SongMeta) => boolean) => songs.filter(f).length
  const tiles: [string, number][] = [
    ['首歌', songs.length],
    [STATUS.learned, count((s) => s.status === 'learned')],
    [STATUS.learning, count((s) => s.status === 'learning')],
    [STATUS.want, count((s) => s.status === 'want')],
    ['收藏', count((s) => !!s.fav)],
    ['已打点', count((s) => !!s.timed)],
  ]
  const saveName = () => name.trim() !== (profile.nickname ?? '') && onSave({ ...profile, nickname: name.trim() || undefined })

  return (
    <main className="profile-page no-print">
      <section className="box profile-head">
        <label className="avatar-pick" title="换头像">
          <Avatar profile={profile} email={email} size={88} />
          <span>换头像</span>
          <input
            hidden
            type="file"
            accept="image/*"
            onChange={async (e) => {
              const f = e.target.files?.[0]
              if (f) onSave({ ...profile, avatar: await toCover(f, 128) })
            }}
          />
        </label>
        <div className="profile-name">
          <input
            className="title-input"
            value={name}
            placeholder="起个昵称"
            onChange={(e) => setName(e.target.value)}
            onBlur={saveName}
            onKeyDown={(e) => e.key === 'Enter' && !e.nativeEvent.isComposing && e.currentTarget.blur()}
          />
          <span className="hint">{email ?? '没登录 · 资料只存在这台设备上'}</span>
          <div className="chips">
            {profile.avatar && (
              <button className="chip" onClick={() => onSave({ ...profile, avatar: undefined })}>
                移除头像
              </button>
            )}
            <button className="chip" onClick={onSettings}>
              设置
            </button>
          </div>
        </div>
      </section>

      <section className="box">
        <h2>曲库</h2>
        <div className="tiles">
          {tiles.map(([label, n]) => (
            <div key={label} className="tile">
              <b>{n}</b>
              <span>{label}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="box">
        <h2>练习</h2>
        <div className="tiles">
          <div className="tile">
            <b>{mins(p.today)}</b>
            <span>今天</span>
          </div>
          <div className="tile">
            <b>{mins(p.week.reduce((a, d) => a + d.seconds, 0))}</b>
            <span>最近 7 天</span>
          </div>
          <div className="tile">
            <b>{p.streak} 天</b>
            <span>连续练习</span>
          </div>
          <div className="tile">
            <b>{mins(p.total)}</b>
            <span>累计</span>
          </div>
        </div>
        <div className="week-chart" role="img" aria-label="最近 7 天每天的练习时长">
          {p.week.map((d) => (
            <div key={d.day} title={`${d.day} · ${mins(d.seconds)}`}>
              <i style={{ height: `${Math.max(3, (d.seconds / max) * 100)}%` }} className={d.seconds ? '' : 'none'} />
              <span>{['日', '一', '二', '三', '四', '五', '六'][new Date(`${d.day}T12:00:00`).getDay()]}</span>
            </div>
          ))}
        </div>
        <p className="hint">播放时自动计时，只记在这台设备上。</p>
      </section>
    </main>
  )
}
