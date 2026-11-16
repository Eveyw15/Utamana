// Japanese -> Chinese, one translation per line. Called from the browser: Google allows CORS here,
// and rate-limits (429) datacenter IPs such as Vercel's, so a server proxy fails in production.

// shortcut: unofficial Google Translate endpoint (no key), may break or rate-limit; swap for a keyed API if it does.
async function googleTranslate(text: string) {
  const res = await fetch('https://translate.googleapis.com/translate_a/single?client=gtx&sl=ja&tl=zh-CN&dt=t', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ q: text }),
  })
  if (!res.ok) throw new Error(`Google 翻译返回 ${res.status}`)
  const data = (await res.json()) as [[string, string][]]
  return data[0].map((s) => s[0]).join('')
}

export async function translateLines(lines: string[]) {
  const out = (await googleTranslate(lines.join('\n'))).split('\n').map((s) => s.trim())
  // Google occasionally merges lines; fall back to one request per line so rows stay aligned.
  return out.length === lines.length ? out : Promise.all(lines.map((l) => googleTranslate(l)))
}
