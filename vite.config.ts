import react from '@vitejs/plugin-react'
import { spawn } from 'node:child_process'
import { defineConfig, type Plugin } from 'vite'

// GET /api/audio?url=... downloads the audio track of a Bilibili/YouTube video with yt-dlp (must be on PATH).
// shortcut: only works under `npm run dev` / `npm run preview`, a static build has no server.
function ytdlp(): Plugin {
  const handler = (req: import('node:http').IncomingMessage, res: import('node:http').ServerResponse, next: () => void) => {
    const u = new URL(req.url ?? '', 'http://x')
    if (u.pathname !== '/api/audio') return next()
    const target = u.searchParams.get('url') ?? ''
    const fail = (code: number, msg: string) => {
      res.statusCode = code
      res.setHeader('Content-Type', 'text/plain; charset=utf-8')
      res.end(msg)
    }
    if (!/^https?:\/\//.test(target)) return fail(400, '链接要以 http:// 或 https:// 开头')
    // `--` stops a crafted URL from being read as a yt-dlp option.
    const p = spawn('yt-dlp', ['-f', 'bestaudio[ext=m4a]/bestaudio', '--no-playlist', '-o', '-', '--', target])
    const chunks: Buffer[] = []
    let err = ''
    p.stdout.on('data', (c: Buffer) => chunks.push(c))
    p.stderr.on('data', (c: Buffer) => (err = (err + c).slice(-2000)))
    p.on('error', () => fail(500, '没找到 yt-dlp，先运行 winget install yt-dlp.yt-dlp 并重启 npm run dev'))
    p.on('close', (code) => {
      if (res.headersSent || res.writableEnded) return
      if (code !== 0 || !chunks.length) return fail(502, err.trim().split('\n').pop() || `yt-dlp 退出码 ${code}`)
      res.setHeader('Content-Type', 'application/octet-stream')
      res.end(Buffer.concat(chunks))
    })
    res.on('close', () => !res.writableFinished && p.kill())
  }
  return {
    name: 'ytdlp',
    configureServer: (s) => void s.middlewares.use(handler),
    configurePreviewServer: (s) => void s.middlewares.use(handler),
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), ytdlp()],
})
