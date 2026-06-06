import { chromium } from 'playwright';
import * as cheerio from 'cheerio';
import Bottleneck from 'bottleneck';
import { resolveUrl, isSameOrigin, parseTarget } from './src-path-resolver.js';

const MODES = {
  light: { timeout: 10000, delay: 500, retries: 3, maxPages: 50 },
  fast: { timeout: 20000, delay: 300, retries: 5, maxPages: 500 },
  complete: { timeout: 30000, delay: 200, retries: 7, maxPages: 2000 },
  aggressive: { timeout: 45000, delay: 100, retries: 10, maxPages: 10000 },
  nuclear: { timeout: 90000, delay: 60, retries: 12, maxPages: 50000 }
};

export class CoreCrawler {
  constructor(targetUrl, mode = 'fast', concurrent = 8) {
    this.target = targetUrl;
    this.targetInfo = parseTarget(targetUrl);
    this.mode = MODES[mode] || MODES.fast;
    this.concurrent = Math.min(concurrent, 20);
    this.visited = new Set();
    this.queue = [targetUrl];
    this.results = { pages: [], errors: [] };
    this.stats = { pages: 0, links: 0, errors: 0 };
    this.limiter = new Bottleneck({ minTime: this.mode.delay, maxConcurrent: this.concurrent });
    this.networkLogs = [];
  }

  async crawl(maxPages) {
    const limit = maxPages || this.mode.maxPages;
    const browser = await chromium.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage']
    });

    const context = await browser.newContext({
      viewport: { width: 1920, height: 1080 },
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      ignoreHTTPSErrors: true
    });

    const page = await context.newPage();
    page.on('response', r => {
      this.networkLogs.push({
        url: r.url(),
        status: r.status(),
        type: r.request().resourceType(),
        size: r.headers()['content-length'] || 0
      });
    });

    while (this.queue.length > 0 && this.stats.pages < limit) {
      const url = this.queue.shift();
      if (!url || this.visited.has(url)) continue;
      this.visited.add(url);

      try {
        await this.limiter.schedule(async () => {
          console.log(`[CRAWL ${this.stats.pages}/${limit}] ${url}`);
          try {
            await page.goto(url, { waitUntil: 'domcontentloaded', timeout: this.mode.timeout }).catch(() => {});
            const html = await page.content();
            const $ = cheerio.load(html);

            this.results.pages.push({
              url,
              title: $('title').text() || 'Untitled',
              size: html.length,
              images: $('img').length,
              links: $('a').length,
              scripts: $('script').length,
              styles: $('link[rel="stylesheet"]').length,
              forms: $('form').length,
              iframes: $('iframe').length,
              timestamp: new Date().toISOString()
            });

            $('a[href]').each((_, el) => {
              const href = $(el).attr('href');
              const full = resolveUrl(href, url);
              if (full && isSameOrigin(full, this.targetInfo.origin) && !this.visited.has(full) && this.queue.length < 5000) {
                this.queue.push(full);
                this.stats.links++;
              }
            });

            this.stats.pages++;
          } catch (e) {
            this.stats.errors++;
            this.results.errors.push({ url, error: e.message });
          }
        });
      } catch {
        this.stats.errors++;
      }
    }

    await browser.close();
    return { pages: this.results.pages, stats: this.stats, networkActivity: this.networkLogs, mode: this.mode };
  }
}

export default CoreCrawler;
