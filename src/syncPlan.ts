type Stamp = { id: string; updated: number }
type RemoteStamp = Stamp & { deleted: boolean }

// Last write wins per song, compared by the `updated` timestamp.
export function planSync(local: Stamp[], remote: RemoteStamp[]) {
  const mine = new Map(local.map((s) => [s.id, s.updated]))
  const plan = { pull: [] as string[], push: [] as string[], removeLocal: [] as string[] }
  for (const r of remote) {
    const l = mine.get(r.id)
    mine.delete(r.id)
    if (r.deleted) {
      if (l != null) plan.removeLocal.push(r.id)
    } else if (l == null || r.updated > l) plan.pull.push(r.id)
    else if (l > r.updated) plan.push.push(r.id)
  }
  plan.push.push(...mine.keys()) // only on this device so far
  return plan
}
