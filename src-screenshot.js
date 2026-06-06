import fs from 'fs';
import path from 'path';
import { chromium } from 'playwright';

export async function captureScreenshots(urls, outputDir, max = 20) {
  const dir = path.join(outputDir, 'screenshots');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  const shots = [];
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 1,
    ignoreHTTPSErrors: true
  });
  const page = await context.newPage();

  for (const url of urls.slice(0, max)) {
    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 25000 });
      await page.waitForTimeout(800);
      const slug = new URL(url).pathname.replace(/[^a-zA-Z0-9]/g, '_').slice(0, 60) || 'home';
      const filePath = path.join(dir, `${slug}.png`);
      await page.screenshot({ path: filePath, fullPage: false, type: 'png' });
      shots.push({ url, path: path.relative(outputDir, filePath).replace(/\\/g, '/'), size: fs.statSync(filePath).size });
    } catch {}
  }

  await browser.close();
  return shots;
}

export default { captureScreenshots };
