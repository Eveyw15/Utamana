// Copies kuromoji's prebuilt browser bundle and dictionary into public/.
// The bundle is loaded with a <script> tag because its bundled zlib breaks under ESM.
// Dictionary files are renamed .dat.gz -> .dat.bin: servers send .gz with Content-Encoding: gzip,
// the browser unzips it, and kuromoji then fails trying to unzip it again.
import { cpSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'

rmSync('public/dict', { recursive: true, force: true })
for (const f of readdirSync('node_modules/kuromoji/dict'))
  cpSync(`node_modules/kuromoji/dict/${f}`, `public/dict/${f.replace(/\.gz$/, '.bin')}`)
const js = readFileSync('node_modules/kuromoji/build/kuromoji.js', 'utf8').replaceAll('.dat.gz"', '.dat.bin"')
writeFileSync('public/kuromoji.js', js)
