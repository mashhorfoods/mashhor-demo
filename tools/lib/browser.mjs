// Headless Chromium for the tools (the audits and the image builders).
// $CHROMIUM wins; otherwise the bundled /opt/pw-browsers/chromium when it
// exists; otherwise Playwright's own download (`npx playwright install chromium`).
import { chromium } from 'playwright';
import { existsSync } from 'node:fs';
import { relative } from 'node:path';

const ROOT = new URL('../../', import.meta.url).pathname;
const exe = process.env.CHROMIUM ?? (existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined);

export const launch = () => chromium.launch(exe ? { executablePath: exe } : {});

/** Renders a self-contained HTML document at width×height and writes it to `outPath` (absolute) as a JPEG
    (at `quality`) or a PNG with a transparent background. Waits for web fonts before the screenshot. */
export async function renderTo(browser, html, width, height, outPath, type = 'jpeg', quality = 86) {
  const page = await browser.newPage({ viewport: { width, height } });
  await page.setContent(html);
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: outPath, type, ...(type === 'jpeg' ? { quality } : { omitBackground: true }) });
  await page.close();
  console.log('wrote', relative(ROOT, outPath));
}
