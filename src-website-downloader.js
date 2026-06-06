import { chromium } from 'playwright';
import * as cheerio from 'cheerio';
import axios from 'axios';
import Bottleneck from 'bottleneck';
import fs from 'fs';
import path from 'path';
import {
  parseTarget, isSameOrigin, resolveUrl, urlToLocalPath,
  isDownloadableAsset, contentTypeToExt
} from './src-path-resolver.js';
import { injectHtmlWatermark, injectCssWatermark, injectJsWatermark } from './src-watermark.js';
import { rewriteHtmlLinks, rewriteCssUrls } from './src-offline-rewriter.js';
import { fetchSeedUrls } from './src-seed-parser.js';

const MODES = {
  light: { timeout: 15000, delay: 350, retries: 4, maxPages: 50, maxAssets: 800, scroll: false },
  fast: { timeout: 25000, delay: 150, retries: 6, maxPages: 500, maxAssets: 8000, scroll: true },
  complete: { timeout: 45000, delay: 100, retries: 8, maxPages: 2000, maxAssets: 30000, scroll: true },
  aggressive: { timeout: 60000, delay: 60, retries: 10, maxPages: 10000, maxAssets: 100000, scroll: true },
  nuclear: { timeout: 90000, delay: 40, retries: 12, maxPages: 50000, maxAssets: 500000, scroll: true }
};

const SELECTORS = [
  'a[href]', 'link[href]', 'script[src]', 'img[src]', 'img[srcset]',
  'source[src]', 'source[srcset]', 'video[src]', 'audio[src]', 'track[src]',
  'embed[src]', 'object[data]', 'iframe[src]', 'form[action]',
  'meta[property="og:image"]', 'meta[name="twitter:image"]', 'meta[property="og:url"]',
  'link[rel="icon"]', 'link[rel="shortcut icon"]', 'link[rel="apple-touch-icon"]',
  'link[rel="preload"]', 'link[rel="prefetch"]', 'link[rel="manifest"]',
  'link[rel="stylesheet"]', 'use[href]', 'image[href]', 'animate[href]'
];

const JS_URL_PATTERNS = [
  /['"`](\/[^'"`?\s]+\.(?:js|css|json|php|html|svg|png|jpg|woff2?))(?:\?[^'"`]*)?['"`]/gi,
  /['"`](https?:\/\/[^'"`?\s]+)['"`]/gi,
  /import\s*\(\s*['"`]([^'"`]+)['"`]\s*\)/g,
  /from\s+['"`]([^'"`]+)['"`]/g
];

export class WebsiteDownloader {
  constructor(targetUrl, mode = 'fast', concurrent = 16, outputDir = './output', tracker = null) {
    this.target = targetUrl;
    this.targetInfo = parseTarget(targetUrl);
    this.mode = MODES[mode] || MODES.fast;
    this.concurrent = Math.min(concurrent, 40);
    this.outputDir = outputDir;
    this.tracker = tracker;
    this.visited = new Set();
    this.queued = new Set();
    this.downloaded = new Map();
    this.queue = [];
    this.errors = [];
    this.stats = { pages: 0, assets: 0, bytes: 0, errors: 0, skipped: 0, networkHits: 0 };
    this.limiter = new Bottleneck({ minTime: this.mode.delay, maxConcurrent: this.concurrent });
    this.networkCaptured = new Set();
  }

  pushQueue(url) {
    if (!url || this.visited.has(url) || this.queued.has(url)) return;
    this.queued.add(url);
    this.queue.push(url);
  }

  log(msg, level = 'info') {
    if (this.tracker) this.tracker.log(msg, level);
  }

  tick(extra = {}) {
    if (this.tracker) {
      this.tracker.tick({
        pages: this.stats.pages,
        assets: this.stats.assets,
        bytes: this.stats.bytes,
        errors: this.stats.errors,
        ...extra
      });
    }
  }

  extractUrls($, pageUrl) {
    const found = new Set();
    for (const sel of SELECTORS) {
      $(sel).each((_, el) => {
        for (const attr of ['href', 'src', 'data', 'action', 'content', 'poster']) {
          const val = $(el).attr(attr);
          if (val) {
            const resolved = resolveUrl(val, pageUrl);
            if (resolved) found.add(resolved);
          }
        }
        const srcset = $(el).attr('srcset');
        if (srcset) {
          srcset.split(',').forEach(part => {
            const u = part.trim().split(/\s+/)[0];
            const resolved = resolveUrl(u, pageUrl);
            if (resolved) found.add(resolved);
          });
        }
      });
    }
    const inline = [$('style').html(), $('[style]').map((_, e) => $(e).attr('style')).get().join(' ')].join('\n');
    const urlRegex = /url\(\s*['"]?([^'")]+)['"]?\s*\)/gi;
    let m;
    while ((m = urlRegex.exec(inline)) !== null) {
      const resolved = resolveUrl(m[1], pageUrl);
      if (resolved) found.add(resolved);
    }
    return [...found];
  }

  extractFromJs(code, pageUrl) {
    const found = new Set();
    for (const regex of JS_URL_PATTERNS) {
      const re = new RegExp(regex.source, regex.flags);
      let match;
      while ((match = re.exec(code)) !== null) {
        const resolved = resolveUrl(match[1], pageUrl);
        if (resolved) found.add(resolved);
      }
    }
    return [...found];
  }

  parseCssImports(css, cssUrl) {
    const found = new Set();
    const importRe = /@import\s+(?:url\()?['"]?([^'")\s;]+)['"]?\)?/gi;
    let m;
    while ((m = importRe.exec(css)) !== null) {
      const resolved = resolveUrl(m[1], cssUrl);
      if (resolved) found.add(resolved);
    }
    const urlRe = /url\(\s*['"]?([^'")]+)['"]?\s*\)/gi;
    while ((m = urlRe.exec(css)) !== null) {
      if (!m[1].startsWith('data:')) {
        const resolved = resolveUrl(m[1], cssUrl);
        if (resolved) found.add(resolved);
      }
    }
    return [...found];
  }

  async downloadAsset(url, retries = 0) {
    if (this.downloaded.has(url)) return this.downloaded.get(url);
    if (!isDownloadableAsset(url) && !isSameOrigin(url, this.targetInfo.origin)) {
      this.stats.skipped++;
      return null;
    }

    const localPath = urlToLocalPath(url, this.outputDir, this.targetInfo.hostname);
    const dir = path.dirname(localPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    try {
      const response = await axios.get(url, {
        timeout: this.mode.timeout,
        responseType: 'arraybuffer',
        maxRedirects: 8,
        validateStatus: s => s < 500,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
          'Accept': '*/*',
          'Accept-Language': 'en-US,en;q=0.9',
          'Accept-Encoding': 'gzip, deflate, br',
          'Referer': this.targetInfo.origin,
          'Sec-Fetch-Dest': 'document',
          'Sec-Fetch-Mode': 'navigate'
        }
      });

      if (response.status >= 400) {
        this.errors.push({ url, status: response.status });
        this.stats.errors++;
        return null;
      }

      let content = response.data;
      const contentType = response.headers['content-type'] || '';
      const ext = path.extname(localPath);
      const cssImports = [];

      if (contentType.includes('text/html') || ext === '.html' || ext === '.htm' || ext === '.php' || ext === '.asp' || ext === '.aspx') {
        let html = Buffer.from(content).toString('utf-8');
        html = rewriteHtmlLinks(html, url, this.outputDir, this.targetInfo.hostname);
        html = injectHtmlWatermark(html);
        content = Buffer.from(html, 'utf-8');
        this.stats.pages++;
      } else if (contentType.includes('text/css') || ext === '.css' || ext === '.scss' || ext === '.less') {
        let css = Buffer.from(content).toString('utf-8');
        cssImports.push(...this.parseCssImports(css, url));
        css = rewriteCssUrls(css, url, this.outputDir, this.targetInfo.hostname);
        css = injectCssWatermark(css);
        content = Buffer.from(css, 'utf-8');
        this.stats.assets++;
      } else if (contentType.includes('javascript') || ext === '.js' || ext === '.mjs') {
        let js = Buffer.from(content).toString('utf-8');
        js = injectJsWatermark(js);
        content = Buffer.from(js, 'utf-8');
        this.stats.assets++;
      } else {
        this.stats.assets++;
      }

      fs.writeFileSync(localPath, content);
      const entry = { url, localPath, size: content.length, contentType };
      this.downloaded.set(url, entry);
      this.stats.bytes += content.length;
      this.tick({ url });

      for (const imp of cssImports) this.pushQueue(imp);

      return entry;
    } catch (e) {
      if (retries < this.mode.retries) {
        await new Promise(r => setTimeout(r, 800 * (retries + 1)));
        return this.downloadAsset(url, retries + 1);
      }
      this.errors.push({ url, error: e.message });
      this.stats.errors++;
      return null;
    }
  }

  async spaScroll(page) {
    if (!this.mode.scroll) return;
    try {
      await page.evaluate(async () => {
        await new Promise(resolve => {
          let total = 0;
          const step = () => {
            const h = document.body?.scrollHeight || 0;
            window.scrollBy(0, 400);
            total += 400;
            if (total < h) setTimeout(step, 120);
            else resolve();
          };
          step();
        });
      });
      await page.waitForTimeout(600);
    } catch {}
  }

  async crawlPage(url, page) {
    const discovered = new Set();
    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: this.mode.timeout }).catch(() => {});
      await this.spaScroll(page);
      await page.waitForLoadState('networkidle', { timeout: 8000 }).catch(() => {});
      const html = await page.content();
      const $ = cheerio.load(html);
      this.extractUrls($, url).forEach(u => discovered.add(u));
      $('script:not([src])').each((_, el) => {
        this.extractFromJs($(el).html() || '', url).forEach(u => discovered.add(u));
      });
    } catch (e) {
      this.errors.push({ url, error: e.message, phase: 'crawl' });
      this.stats.errors++;
    }
    return [...discovered];
  }

  async run(maxPages) {
    const limit = maxPages || this.mode.maxPages;
    const mirrorDir = path.join(this.outputDir, 'mirror', this.targetInfo.hostname.replace(/[^a-zA-Z0-9.-]/g, '_'));
    if (!fs.existsSync(mirrorDir)) fs.mkdirSync(mirrorDir, { recursive: true });

    if (this.tracker) this.tracker.setPhase('seeding', limit);
    this.log('Parsing robots.txt & sitemaps...');
    const seeds = await fetchSeedUrls(this.target);
    seeds.forEach(u => this.pushQueue(u));
    this.log(`Seeded ${seeds.length} URLs from sitemap/robots`);

    const browser = await chromium.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage', '--disable-blink-features=AutomationControlled']
    });

    const context = await browser.newContext({
      viewport: { width: 1920, height: 1080 },
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
      ignoreHTTPSErrors: true,
      locale: 'en-US'
    });

    const page = await context.newPage();

    page.on('response', async r => {
      const u = r.url().split('#')[0];
      const status = r.status();
      if (status < 400 && (isSameOrigin(u, this.targetInfo.origin) || isDownloadableAsset(u))) {
        this.stats.networkHits++;
        this.networkCaptured.add(u);
        if (this.queue.length < limit * 8) this.pushQueue(u);
        if (!this.downloaded.has(u) && r.request().resourceType() !== 'document') {
          this.limiter.schedule(() => this.downloadAsset(u)).catch(() => {});
        }
      }
    });

    if (this.tracker) this.tracker.setPhase('mirroring', limit);
    this.log(`Engine started | ${limit} pages max | ${this.concurrent} threads`);

    while ((this.queue.length > 0 || this.networkCaptured.size > this.downloaded.size) && this.stats.pages < limit && this.downloaded.size < this.mode.maxAssets) {
      const url = this.queue.shift();
      if (!url) {
        await new Promise(r => setTimeout(r, 500));
        continue;
      }
      if (this.visited.has(url)) continue;

      if (!isSameOrigin(url, this.targetInfo.origin)) {
        await this.limiter.schedule(() => this.downloadAsset(url));
        continue;
      }

      this.visited.add(url);
      this.tick({ current: this.stats.pages, total: limit, url });

      const discovered = await this.limiter.schedule(() => this.crawlPage(url, page));
      await this.limiter.schedule(() => this.downloadAsset(url));

      for (const assetUrl of discovered) {
        if (isSameOrigin(assetUrl, this.targetInfo.origin)) {
          this.pushQueue(assetUrl);
        } else if (isDownloadableAsset(assetUrl)) {
          this.limiter.schedule(() => this.downloadAsset(assetUrl)).catch(() => {});
        }
      }
    }

    await browser.close();

    const manifest = {
      target: this.target,
      hostname: this.targetInfo.hostname,
      mirrorPath: mirrorDir,
      timestamp: new Date().toISOString(),
      mode: this.mode,
      stats: this.stats,
      files: [...this.downloaded.values()].map(d => ({
        url: d.url,
        local: path.relative(this.outputDir, d.localPath).replace(/\\/g, '/'),
        size: d.size,
        contentType: d.contentType
      })),
      errors: this.errors.slice(0, 1000)
    };

    fs.writeFileSync(path.join(this.outputDir, 'mirror-manifest.json'), JSON.stringify(manifest, null, 2));
    this.log(`Mirror complete: ${this.stats.pages} pages, ${this.stats.assets} assets`, 'info');
    return manifest;
  }
}

export default WebsiteDownloader;
