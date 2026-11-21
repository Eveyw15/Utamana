// Run: node --test src/practice.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { addPractice, dayKey, practiceStats } from './practice.ts'

const at = (s: string) => new Date(`${s}T12:00:00`)

test('addPractice adds seconds to the local day', () => {
  const log = addPractice(addPractice({}, 30, at('2026-11-20')), 15, at('2026-11-20'))
  assert.deepEqual(log, { '2026-11-20': 45 })
  assert.equal(dayKey(at('2026-01-05')), '2026-01-05')
})

test('practiceStats: today, last 7 days oldest first, total and streak', () => {
  const log = { '2026-11-21': 600, '2026-11-20': 120, '2026-11-19': 60, '2026-11-17': 300, '2026-10-01': 1000 }
  const s = practiceStats(log, at('2026-11-21'))
  assert.equal(s.today, 600)
  assert.deepEqual(s.week.map((d) => d.seconds), [0, 0, 300, 0, 60, 120, 600])
  assert.equal(s.week[6].day, '2026-11-21')
  assert.equal(s.total, 2080)
  assert.equal(s.streak, 3) // 19, 20, 21
})

test('streak still counts when today has no practice yet', () => {
  assert.equal(practiceStats({ '2026-11-20': 60, '2026-11-19': 60 }, at('2026-11-21')).streak, 2)
  assert.equal(practiceStats({ '2026-11-18': 60 }, at('2026-11-21')).streak, 0)
  assert.equal(practiceStats({}, at('2026-11-21')).streak, 0)
})
