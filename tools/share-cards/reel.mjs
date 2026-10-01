// Renders a promo video (<name>.html, default reel) to
// brand/kit/videos/pixora-<name>.mp4 — reel.html (the agency, 18s),
// reel-branding.html (one service, 10s):
// 1080×1920, 30 fps, H.264 with a silent audio track (add music in the app).
// Each frame is the page's animations paused at that instant, so the video is
// the same every time.
//   node tools/share-cards/reel.mjs [name]   (needs ffmpeg; CHROMIUM=/path/to/chrome if needed)
import { chromium } from 'playwright';
import { fileURLToPath } from 'node:url';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const out = path.join(here, '..', '..', 'brand', 'kit', 'videos');
mkdirSync(out, { recursive: true });
const FPS = 30;
const NAME = process.argv[2] || 'reel';
const frames = mkdtempSync(path.join(tmpdir(), 'pixora-reel-'));
const browser = await chromium.launch(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {});
const page = await browser.newPage({ viewport: { width: 1080, height: 1920 } });
await page.goto(`file://${path.join(here, `${NAME}.html`)}`);
await page.evaluate(() => document.fonts.ready);
await page.waitForFunction(() => [...document.images].every((i) => i.complete && i.naturalWidth));
const duration = await page.evaluate(() => window.DURATION);
const total = Math.round(duration * FPS);
for (let f = 0; f < total; f += 1) {
  await page.evaluate((t) => window.seek(t), f / FPS);
  await page.screenshot({ path: path.join(frames, `f${String(f).padStart(4, '0')}.jpg`), type: 'jpeg', quality: 94 });
  if (f % 60 === 0) process.stdout.write(`frame ${f}/${total}\r`);
}
await browser.close();
const file = path.join(out, `pixora-${NAME}.mp4`);
execFileSync('ffmpeg', ['-v', 'error', '-y', '-framerate', String(FPS), '-i', path.join(frames, 'f%04d.jpg'),
  '-f', 'lavfi', '-i', 'anullsrc=channel_layout=stereo:sample_rate=44100',
  '-c:v', 'libx264', '-preset', 'slow', '-crf', '18', '-pix_fmt', 'yuv420p', '-r', String(FPS),
  '-c:a', 'aac', '-b:a', '128k', '-shortest', '-movflags', '+faststart', file]);
rmSync(frames, { recursive: true, force: true });
console.log(`\nbrand/kit/videos/pixora-${NAME}.mp4 (${duration}s, ${total} frames)`);
