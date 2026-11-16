// POST /api/translate {lines: string[]} -> string[], one translation per line.
// Runs as a Vercel function in production; vite.config.ts reuses translateLines for the dev server.

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

export async function POST(req: Request) {
  try {
    const { lines } = (await req.json()) as { lines: string[] }
    if (!Array.isArray(lines) || lines.length > 500) return new Response('bad lines', { status: 400 })
    return Response.json(await translateLines(lines.map(String)))
  } catch (e) {
    return new Response(String(e), { status: 502 })
  }
}
