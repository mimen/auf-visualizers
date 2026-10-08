// Renders a release to video files: node export/export.mjs <release.json> [youtube|story|reels ...] [--fps 30] [--full]
// youtube renders the whole track; story and reels render release.clip unless --full.
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2), flag = (n) => args.includes(n), opt = (n, d) => { const i = args.indexOf(n); return i < 0 ? d : args[i + 1]; };
const relPath = path.resolve(args[0]), rel = JSON.parse(fs.readFileSync(relPath, 'utf8'));
const formats = args.slice(1).filter((a) => ['youtube', 'story', 'reels'].includes(a));
const fps = +opt('--fps', 30), root = path.resolve(import.meta.dirname, '..'), outDir = path.join(root, 'export', 'out');
const slug = path.basename(relPath, '.json');
fs.mkdirSync(outDir, { recursive: true });

// Static server for the repo, plus /audio for the release's master file.
const types = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.png': 'image/png', '.webp': 'image/webp', '.otf': 'font/otf', '.ttf': 'font/ttf' };
const server = http.createServer((req, res) => {
  const url = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  const file = url === '/audio' ? rel.audio : path.join(root, url);
  if (!file.startsWith(root) && url !== '/audio') return res.writeHead(403).end();
  fs.readFile(file, (err, data) => err ? res.writeHead(404).end() : res.writeHead(200, { 'content-type': types[path.extname(file)] || 'application/octet-stream' }).end(data));
}).listen(0);
const port = server.address().port;

const browser = await chromium.launch({ args: ['--use-gl=angle', '--enable-unsafe-swiftshader', '--disable-gpu-sandbox'] });
for (const format of formats.length ? formats : ['youtube', 'story', 'reels']) {
  const page = await browser.newPage();
  page.on('pageerror', (e) => { console.error(e); process.exit(1); });
  await page.goto(`http://localhost:${port}/export/render.html?format=${format}`);
  // Image paths in the release file are relative to it; the page loads them from the server root.
  const url = (f) => '/' + path.relative(root, path.resolve(path.dirname(relPath), f));
  const release = { ...rel, cover: url(rel.cover), illo: url(rel.illo) };
  const { duration } = await page.evaluate((r) => window.init(r), release);
  const whole = format === 'youtube' || flag('--full');
  const start = whole ? 0 : rel.clip.start, len = whole ? duration : rel.clip.duration;
  const out = path.join(outDir, `${slug}-${format}.mp4`);
  const ff = spawn('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(fps), '-i', '-',
    '-ss', String(start), '-t', String(len), '-i', rel.audio,
    '-map', '0:v', '-map', '1:a', '-c:v', 'libx264', '-preset', 'slow', '-crf', '16', '-pix_fmt', 'yuv420p', '-r', String(fps),
    '-c:a', 'aac', '-b:a', '320k', '-movflags', '+faststart', '-shortest', out], { stdio: ['pipe', 'inherit', 'inherit'] });
  // Pre-roll 4 s without capturing so the ridge history is full on frame one.
  const dt = 1 / fps, pre = Math.min(start, 4), frames = Math.round(len * fps), t0 = Date.now();
  for (let i = -Math.round(pre * fps); i < 0; i++) await page.evaluate(([t, d]) => window.renderFrame(t, d), [start + i * dt, dt]);
  for (let i = 0; i < frames; i++) {
    const png = await page.evaluate(([t, d]) => { window.renderFrame(t, d); return document.getElementById('out').toDataURL('image/png').slice(22); }, [start + i * dt, dt]);
    if (!ff.stdin.write(Buffer.from(png, 'base64'))) await new Promise((r) => ff.stdin.once('drain', r));
    if (i % (fps * 10) === 0) process.stdout.write(`\r${format}: ${(i / fps).toFixed(0)}/${len.toFixed(0)} s, ${((Date.now() - t0) / 1000 / Math.max(1, i) * (frames - i) / 60).toFixed(1)} min left   `);
  }
  ff.stdin.end(); await new Promise((r, j) => ff.on('close', (c) => c ? j(Error('ffmpeg exited ' + c)) : r()));
  console.log(`\r${format}: ${out}                              `);
  await page.close();
}
await browser.close(); server.close();
