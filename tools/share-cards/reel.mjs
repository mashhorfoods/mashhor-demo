// Renders a promo video (<name>.html, default reel) to
// brand/kit/videos/pixora-<name>.mp4 — reel.html (the agency, 18s),
// reel-branding.html (one service, 10s), reel-energy.html (the brand, 15s,
// cut to the beat, with its own soundtrack and motion blur):
// 1080×1920, 30 fps, H.264. A page that declares window.CUES gets the
// soundtrack composed to them (soundtrack.py) and SUB sub-frames per frame,
// averaged into motion blur; the others get a silent track.
// Each frame is the page's animations paused at that instant, so the video is
// the same every time.
//   node tools/share-cards/reel.mjs [name]   (needs ffmpeg; CHROMIUM=/path/to/chrome if needed)
import { chromium } from 'playwright';
import { fileURLToPath } from 'node:url';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
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
const cues = await page.evaluate(() => window.CUES || null);
const SUB = cues ? Number(process.env.SUB || 5) : 1;
const total = Math.round(duration * FPS * SUB);
for (let f = 0; f < total; f += 1) {
  // With sub-frames, each frame averages the instants just before it.
  await page.evaluate((t) => window.seek(t), f / (FPS * SUB));
  await page.screenshot({ path: path.join(frames, `f${String(f).padStart(5, '0')}.jpg`), type: 'jpeg', quality: 94 });
  if (f % 150 === 0) process.stdout.write(`frame ${f}/${total}\r`);
}
await browser.close();
const file = path.join(out, `pixora-${NAME}.mp4`);
let audio = ['-f', 'lavfi', '-i', 'anullsrc=channel_layout=stereo:sample_rate=44100'];
if (cues) {
  const json = path.join(frames, 'cues.json'), wav = path.join(frames, 'soundtrack.wav');
  writeFileSync(json, JSON.stringify(cues));
  execFileSync('python3', [path.join(here, 'soundtrack.py'), json, wav]);
  audio = ['-i', wav, '-af', 'loudnorm=I=-14:TP=-2:LRA=11'];
}
const blur = SUB > 1 ? ['-vf', `tmix=frames=${SUB},select='not(mod(n+1\\,${SUB}))',setpts=N/${FPS}/TB`] : [];
execFileSync('ffmpeg', ['-v', 'error', '-y', '-framerate', String(FPS * SUB), '-i', path.join(frames, 'f%05d.jpg'), ...audio,
  ...blur, '-c:v', 'libx264', '-preset', 'slow', '-crf', '17', '-pix_fmt', 'yuv420p', '-r', String(FPS),
  '-c:a', 'aac', '-b:a', '192k', '-shortest', '-movflags', '+faststart', file]);
rmSync(frames, { recursive: true, force: true });
console.log(`\nbrand/kit/videos/pixora-${NAME}.mp4 (${duration}s, ${total} frames)`);
