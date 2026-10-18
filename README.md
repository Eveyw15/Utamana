# うたまな Utamana

本地运行的日语歌学习工具：粘贴歌词自动注假名和罗马音，上传自己的音乐，逐行打点同步，变速、升降 key、调人声音量，打印成 PDF。

## 运行

```bash
npm install
npm run dev
```

打开 http://localhost:5173 。数据保存在浏览器 IndexedDB 里，换浏览器看不到。

## 用法

- **歌词**：编辑页粘贴纯文本或 LRC，或导入 `.txt` / `.lrc`。读音不对写成 `漢字{よみ}`。
- **音频**：原曲、人声、伴奏三轨都可选。用 MISST / UVR 分离出人声和伴奏分别上传，练习页能单独调音量；只有原曲时可勾选「简易消人声」。
- **改读音 / 改歌词**：练习页点汉字改读音（可输入假名或罗马音，留空恢复自动），鼠标移到一句上点 ✎ 改整句。
- **在线视频**：编辑页粘贴 B站 / YouTube 链接导入为原曲，需要先装 yt-dlp（`winget install yt-dlp.yt-dlp`）并重启 `npm run dev`。导入后可「保存到本地」再拿去 MISST / UVR 分离。
- **翻译**：编辑页导入翻译 `.txt` / `.lrc`（带时间轴的按时间对齐），或点「自动翻译」（通过 Google 翻译，需要联网，歌词会发给 Google）。翻译框可直接改，练习页可开关显示。
- **打点**：练习页点「开始打点」，每句开始唱时按空格，退格回上一句。打好后可导出 `.lrc`。
- **节拍器**：练习页点「自动测速」测出 BPM 和拍点，速度滑条随之改为按 BPM 调。节拍器可换音色、调音量，跟着变速同步。重音没对上时，在小节第一拍处点那一段的时间；变拍子或变速的地方用「从当前位置变拍」加一段，分别设 BPM 和每小节拍数。测出的 BPM 差一倍时用 ÷2 / ×2。
- **打印**：练习页「打印 / 导出 PDF」，在打印对话框选「另存为 PDF」。假名、罗马音开关会影响打印内容。

## 账号和云同步（可选）

不配置也能用，数据只存在本机浏览器。想多设备同步：

1. 在 https://supabase.com 注册并新建一个项目（免费版即可）。
2. 打开项目的 SQL Editor，粘贴 `supabase/schema.sql` 的内容并运行。
3. Authentication -> URL Configuration，把 Site URL 设成 `http://localhost:5173`。
4. 复制 `.env.example` 为 `.env.local`，填入 Project Settings -> API 里的 Project URL 和 anon public key。
5. 重启 `npm run dev`，点右上角「设置」用邮箱登录。

同步内容：歌词、读音、时间轴、翻译和音频。同一首歌两边都改过时，以最后保存的为准。免费版存储 1 GB，音频大约够一两百首。

## 测试

```bash
node --test src/furigana.test.ts src/lrc.test.ts
```
