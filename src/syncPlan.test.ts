// Run: node --test src/syncPlan.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { planSync } from './syncPlan.ts'

test('planSync picks the newer side and honours tombstones', () => {
  const plan = planSync(
    [
      { id: 'same', updated: 5 },
      { id: 'localNewer', updated: 9 },
      { id: 'remoteNewer', updated: 1 },
      { id: 'deletedElsewhere', updated: 3 },
      { id: 'onlyLocal', updated: 2 },
    ],
    [
      { id: 'same', updated: 5, deleted: false },
      { id: 'localNewer', updated: 4, deleted: false },
      { id: 'remoteNewer', updated: 8, deleted: false },
      { id: 'deletedElsewhere', updated: 6, deleted: true },
      { id: 'onlyRemote', updated: 7, deleted: false },
      { id: 'goneEverywhere', updated: 7, deleted: true },
    ],
  )
  assert.deepEqual(plan, {
    pull: ['remoteNewer', 'onlyRemote'],
    push: ['localNewer', 'onlyLocal'],
    removeLocal: ['deletedElsewhere'],
  })
})
