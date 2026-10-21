// Drives the real app in a fresh Chrome profile and records the screen for the demo video.
// Needs the app running: (repo root) npx vite --port 5199 --strictPort
// Writes public/demo.webm and public/markers.json (seconds since recording start for each step).
import { chromium } from 'playwright-core'
import { copyFileSync, mkdirSync, rmSync, writeFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'

const APP = 'http://localhost:5199/'
const CHROME = process.env.CHROME ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const SIZE = { width: 1920, height: 1080 }

// Original example lines written for this demo (not song lyrics).
const LYRICS = ['朝の光が窓をたたく', '小さな声で歌ってみる', '明日の空を見上げて', '君の名前を呼んでいる', '', '遠い街の灯りが揺れる', '何度でも走り出せる'].join('\n')

// Visible cursor + click ripple, since headless recordings have no pointer.
const CURSOR = `
addEventListener('DOMContentLoaded', () => {
  const c = document.createElement('div')
  c.style.cssText = 'position:fixed;z-index:99999;width:26px;height:26px;margin:-4px 0 0 -4px;pointer-events:none;left:-50px;top:-50px;transition:left .02s,top .02s'
  c.innerHTML = '<svg width="26" height="26" viewBox="0 0 24 24"><path d="M3 2l7 19 2.5-8L21 10z" fill="#fff" stroke="#2b2a33" stroke-width="1.6" stroke-linejoin="round"/></svg>'
  document.body.appendChild(c)
  addEventListener('mousemove', (e) => { c.style.left = e.clientX + 'px'; c.style.top = e.clientY + 'px' }, true)
  addEventListener('mousedown', (e) => {
    const r = document.createElement('div')
    r.style.cssText = 'position:fixed;z-index:99998;pointer-events:none;border:3px solid #e0607e;border-radius:50%;width:10px;height:10px;transform:translate(-50%,-50%);transition:all .45s ease-out;opacity:.9;left:' + e.clientX + 'px;top:' + e.clientY + 'px'
    document.body.appendChild(r)
    requestAnimationFrame(() => { r.style.width = r.style.height = '60px'; r.style.opacity = 0 })
    setTimeout(() => r.remove(), 500)
  }, true)
})`

const outDir = resolve('rec-tmp')
rmSync(outDir, { recursive: true, force: true })
mkdirSync(outDir)

const browser = await chromium.launch({ executablePath: CHROME, headless: true, args: ['--autoplay-policy=no-user-gesture-required'] })
const ctx = await browser.newContext({ viewport: SIZE, recordVideo: { dir: outDir, size: SIZE }, deviceScaleFactor: 1 })
await ctx.addInitScript(CURSOR)
const page = await ctx.newPage()
const t0 = Date.now()
const markers = {}
const mark = (name) => (markers[name] = (Date.now() - t0) / 1000)
const wait = (ms) => page.waitForTimeout(ms)

async function moveTo(locator, opts = {}) {
  await locator.scrollIntoViewIfNeeded()
  const box = await locator.boundingBox()
  const x = box.x + (opts.x ?? box.width / 2), y = box.y + (opts.y ?? box.height / 2)
  await page.mouse.move(x, y, { steps: 25 })
  return { x, y }
}
async function click(locator, opts) {
  const p = await moveTo(locator, opts)
  await wait(250)
  await page.mouse.click(p.x, p.y)
  await wait(400)
}
const nav = (name) => page.locator('nav button', { hasText: name })

page.on('dialog', async (d) => {
  await wait(900)
  await d.accept(d.type() === 'prompt' ? 'asu' : undefined)
})

await page.goto(APP)
await page.waitForSelector('textarea')
await page.mouse.move(960, 540)
await wait(1200)

// 1. New song: paste lyrics.
mark('edit')
await click(page.locator('input:not([type])').first())
await page.keyboard.press('Control+A')
await page.keyboard.type('練習曲', { delay: 120 })
await wait(500)
await click(page.locator('textarea').first())
mark('paste')
await page.keyboard.insertText(LYRICS)
await wait(1500)

// 2. Practice view with furigana and romaji.
mark('furigana')
await click(nav('练习'))
await wait(2500)
await moveTo(page.locator('.sheet li').nth(2), { x: 40 })
await wait(1500)

// 3. Double-click a kanji to fix its reading.
mark('reading')
await moveTo(page.locator('.sheet li').nth(2).locator('ruby').first())
await wait(700)
await page.locator('.sheet li').nth(2).locator('ruby').first().dblclick()
await wait(2500)

// 4. Add audio (the video's own original backing track stands in for a song).
mark('audio')
await click(nav('编辑'))
await page.locator('input[type=file][accept="audio/*"]').first().setInputFiles(resolve('public/bgm.wav'))
await wait(1500)
await click(nav('练习'))
await wait(1000)

// 5. Tap-sync the lyrics with Space.
mark('sync')
await click(page.locator('button', { hasText: '开始打点' }))
for (const at of [4.0, 8.0, 12.0, 16.0, 20.0, 24.0]) {
  const now = (Date.now() - markers.sync * 1000 - t0) / 1000
  await wait(Math.max(0, (at - now + 0.6) * 1000))
  await page.keyboard.press('Space')
}
await wait(800)
await click(page.locator('button', { hasText: '结束打点' }))
mark('seek')
await click(page.locator('.sheet li').nth(1), { x: 60 })
await wait(400)
await page.keyboard.press('Space')
await wait(5500)

// 6. Tap tempo, then slow down by BPM and lower the key.
await page.keyboard.press('Space')
await page.evaluate(() => scrollTo({ top: 0, behavior: 'smooth' }))
await wait(600)
await click(page.locator('.sheet li').first(), { x: 60 })
await page.keyboard.press('Space')
await wait(1500)
mark('tap')
for (let i = 0; i < 6; i++) {
  await page.keyboard.press('KeyT')
  await wait(500)
}
await wait(1200)
mark('speed')
const speed = page.locator('.controls label', { hasText: '速度' }).locator('input[type=range]')
const sb = await speed.boundingBox()
await page.mouse.move(sb.x + sb.width / 2, sb.y + sb.height / 2, { steps: 20 })
await page.mouse.down()
await page.mouse.move(sb.x + sb.width * 0.3, sb.y + sb.height / 2, { steps: 30 })
await page.mouse.up()
await wait(1200)
const key = page.locator('.controls label', { hasText: 'Key' }).locator('input[type=range]')
const kb = await key.boundingBox()
await page.mouse.move(kb.x + kb.width / 2, kb.y + kb.height / 2, { steps: 20 })
await page.mouse.down()
await page.mouse.move(kb.x + kb.width * 0.34, kb.y + kb.height / 2, { steps: 25 })
await page.mouse.up()
await wait(2000)

// 7. Metronome sections for meter changes.
mark('metronome')
await click(page.locator('button', { hasText: '节拍器设置' }))
await wait(800)
await click(page.locator('button', { hasText: '从当前位置变拍' }))
await wait(600)
const beats = page.locator('.sections .row').nth(1).locator('input[type=number]').nth(1)
await click(beats)
await page.keyboard.press('Control+A')
await page.keyboard.type('3', { delay: 150 })
await wait(2500)
await click(page.locator('button', { hasText: '节拍器设置' }))
await page.keyboard.press('Space')
await wait(800)

// 8. Auto translation.
mark('translate')
await click(nav('编辑'))
const tr = page.locator('button', { hasText: '自动翻译' })
await tr.scrollIntoViewIfNeeded()
await wait(600)
await click(tr)
await page.waitForFunction(() => (document.querySelectorAll('textarea')[1]?.value ?? '').length > 4, null, { timeout: 20000 })
await wait(1200)
await click(nav('练习'))
await wait(3000)

// 9. Print layout.
mark('print')
await page.emulateMedia({ media: 'print' })
await wait(3000)
await page.emulateMedia({ media: 'screen' })

// 10. Library.
mark('library')
await click(nav('曲库'))
await wait(2500)
mark('end')

await ctx.close()
await browser.close()
const webm = readdirSync(outDir).find((f) => f.endsWith('.webm'))
copyFileSync(resolve(outDir, webm), resolve('public/demo.webm'))
rmSync(outDir, { recursive: true, force: true })
writeFileSync('public/markers.json', JSON.stringify(markers, null, 1))
console.log(markers)
