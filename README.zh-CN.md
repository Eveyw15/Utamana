# うたまな Utamana

[English](README.md) | 简体中文

学日语歌的练习工具。粘贴歌词自动注假名和罗马音，上传自己的音乐逐句对上歌词，可以变速、升降 key、调人声音量、开节拍器，最后打印成纸质歌词本。

应用本身不带任何歌词，也不会去网上抓歌词，只处理你自己导入的内容。

## 功能

- **自动注音**：用 kuromoji 分词，汉字上方标假名，下方显示罗马音（助词 は/へ/を 读作 wa/e/o）。读音不对可以点汉字直接改，也可以在歌词里写 `漢字{よみ}`。
- **多音轨播放**：原曲、人声、伴奏三轨，各自调音量。人声拉到 0 就是伴奏；只有原曲时可用简易消人声。
- **变速和升降调**：SoundTouch 实时处理，变速不变调，Key ±6 半音。
- **歌词同步**：播放时按空格逐句打点，或导入 `.lrc`；播放时高亮当前句，点歌词跳转。
- **节拍器**：跟着拍子点按测速（按钮或 T 键），速度按 BPM 调；可分段设置 BPM 和每小节拍数，适合变拍子的歌，新分段会自动对齐到前一段的拍子；三种音色可选。
- **翻译**：导入翻译（带时间轴的 LRC 会按时间对齐），或用 Google 翻译自动翻成中文。
- **在线音频**：粘贴 B站 / YouTube 链接导入音频（需要 yt-dlp）。
- **打印 / PDF**：排版好的歌词页，假名、罗马音、翻译都可以选择是否打印。
- **曲库和云同步**：曲库首页管理所有歌曲；可选用 Supabase 账号在多台设备之间同步，包括音频。
- **字体设置**：界面和歌词字体可以分开选，也能用本机安装的字体。

## 运行

需要 Node.js 22 或更新版本。

```bash
npm install
npm run dev
```

打开 http://localhost:5173 。

没配置云同步时，歌曲只存在当前浏览器的 IndexedDB 里，**清除浏览器数据会把它们删掉**。重要的歌请开云同步，或在编辑页导出 `.lrc` 备份。

## 用法

1. **新建歌曲**：在曲库点「＋ 新建歌曲」，填歌名歌手，粘贴歌词（纯文本或 LRC），或导入 `.txt` / `.lrc`。
2. **上传音频**：原曲、人声、伴奏任选。推荐先用 [MISST](https://misst.app/) 或 [UVR](https://github.com/Anjok07/ultimatevocalremovergui) 分离出人声和伴奏，再分别上传。
3. **打点**：在练习页点「开始打点」，每句开始唱时按空格，按退格回到上一句。
4. **节拍器**：播放时从某小节第一拍开始，跟着拍子点「点按测速」或按 T，点 4 下以上就设好 BPM。拍子变化的地方点「从当前位置变拍」，新分段会自动对齐到前一段最近的拍子，差一拍用 ‹ › 挪。
5. **打印**：点「打印 / 导出 PDF」，在打印窗口选「另存为 PDF」。

### 从 B站 / YouTube 导入（可选）

```bash
winget install yt-dlp.yt-dlp
```

装好后重启 `npm run dev`，在编辑页粘贴链接即可。这个功能和自动翻译都通过本地开发服务器转发，只在 `npm run dev` / `npm run preview` 下可用。请遵守各平台条款，只用于个人学习。

### 账号和云同步（可选）

1. 在 [Supabase](https://supabase.com) 新建一个项目（免费版即可）。
2. 打开项目的 SQL Editor，粘贴 [`supabase/schema.sql`](supabase/schema.sql) 并运行。
3. Authentication → URL Configuration，把 Site URL 设成 `http://localhost:5173`。
4. 把 `.env.example` 复制成 `.env.local`，填入 Project Settings → API 里的 Project URL 和 anon public key。
5. 重启 `npm run dev`，点右上角「设置」，用邮箱登录。

同步歌词、读音、时间轴、翻译、节拍设置和音频。同一首歌在两台设备上都改过时，以最后保存的为准。免费版存储 1 GB。

## 开发

```bash
node --test src/*.test.ts   # 单元测试
npm run build               # 类型检查并打包
```

| 文件 | 内容 |
| --- | --- |
| `src/App.tsx` | 界面：曲库、编辑、练习 |
| `src/furigana.ts` | 分词、注音、罗马音 |
| `src/player.ts` | 多音轨混音、变速变调、节拍器混音 |
| `src/beat.ts` | 测速和节拍网格 |
| `src/lrc.ts` | LRC 解析、翻译对齐 |
| `src/db.ts` | 本地存储（IndexedDB） |
| `src/cloud.ts`, `src/syncPlan.ts` | Supabase 云同步 |
| `vite.config.ts` | 本地接口：yt-dlp 下载、翻译转发 |

技术栈：Vite、React、TypeScript、[kuromoji](https://github.com/takuyaa/kuromoji.js)、[wanakana](https://github.com/WaniKani/WanaKana)、[SoundTouchJS](https://github.com/cutterbl/SoundTouchJS)、[Supabase](https://supabase.com)。

## 许可证

[MIT](LICENSE)。第三方库沿用各自的许可证（例如 kuromoji 为 Apache-2.0，SoundTouchJS 为 LGPL-2.1）。
