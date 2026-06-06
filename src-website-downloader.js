import { chromium } from 'playwright';
import * as cheerio from 'cheerio';
import Bottleneck from 'bottleneck';
import fs from 'fs';
import path from 'path';
import {
  parseTarget, isSameOrigin, resolveUrl, urlToLocalPath,
  isDownloadableAsset, getExtension
} from './src-path-resolver.js';
import { injectHtmlWatermark, injectCssWatermark, injectJsWatermark } from './src-watermark.js';
import { rewriteHtmlLinks, rewriteCssUrls } from './src-offline-rewriter.js';
import { fetchSeedUrls } from './src-seed-parser.js';
import { createFastClient, fastGetText, fastGetBuffer, needsBrowserRender } from './src-fast-fetch.js';

const MODES = {
  light: { timeout: 15000, delay: 200, retries: 4, maxPages: 50, maxAssets: 800, scroll: false, assetThreads: 20 },
  fast: { timeout: 20000, delay: 80, retries: 5, maxPages: 500, maxAssets: 8000, scroll: true, assetThreads: 32 },
  complete: { timeout: 30000, delay: 50, retries: 7, maxPages: 2000, maxAssets: 30000, scroll: true, assetThreads: 40 },
  aggressive: { timeout: 40000, delay: 30, retries: 8, maxPages: 10000, maxAssets: 100000, scroll: true, assetThreads: 48 },
  nuclear: { timeout: 60000, delay: 20, retries: 10, maxPages: 50000, maxAssets: 500000, scroll: true, assetThreads: 64 }
};

const SELECTORS = [
  'a[href]', 'link[href]', 'script[src]', 'img[src]', 'img[srcset]',
  'source[src]', 'source[srcset]', 'video[src]', 'audio[src]', 'track[src]',
  'embed[src]', 'object[data]', 'iframe[src]', 'form[action]',
  'meta[property="og:image"]', 'meta[name="twitter:image"]',
  'link[rel="icon"]', 'link[rel="shortcut icon"]', 'link[rel="apple-touch-icon"]',
  'link[rel="preload"]', 'link[rel="prefetch"]', 'link[rel="manifest"]',
  'link[rel="stylesheet"]', 'use[href]', 'image[href]'
];

const JS_URL_PATTERNS = [
  /['"`](\/[^'"`?\s]+\.(?:js|css|json|php|html|svg|png|jpg|woff2?))(?:\?[^'"`]*)?['"`]/gi,
  /['"`](https?:\/\/[^'"`?\s]+)['"`]/gi,
  /import\s*\(\s*['"`]([^'"`]+)['"`]\s*\)/g,
  /from\s+['"`]([^'"`]+)['"`]/g
];

const ASSET_EXT = new Set(['.css', '.js', '.mjs', '.jpg', '.jpeg', '.png', '.gif', '.svg', '.webp', '.ico', '.woff', '.woff2', '.ttf', '.mp4', '.webm', '.json', '.map', '.pdf']);

export class WebsiteDownloader {
  constructor(targetUrl, mode = 'fast', concurrent = 16, outputDir = './output', tracker = null) {
    this.target = targetUrl;
    this.targetInfo = parseTarget(targetUrl);
    this.mode = MODES[mode] || MODES.fast;
    this.concurrent = Math.min(concurrent, 24);
    this.outputDir = outputDir;
    this.tracker = tracker;
    this.visited = new Set();
    this.queued = new Set();
    this.downloaded = new Map();
    this.queue = [];
    this.errors = [];
    this.stats = { pages: 0, assets: 0, bytes: 0, errors: 0, skipped: 0, networkHits: 0, fastHits: 0, browserHits: 0 };
    this.pageLimiter = new Bottleneck({ minTime: this.mode.delay, maxConcurrent: this.concurrent });
    this.assetLimiter = new Bottleneck({ minTime: 10, maxConcurrent: this.mode.assetThreads });
    this.http = createFastClient(this.targetInfo.origin, this.mode.timeout);
    this.browser = null;
    this.page = null;
    this._activeAssets = 0;
    this._heartbeat = null;
  }

  pushQueue(url, front = false) {
    if (!url || this.visited.has(url) || this.queued.has(url)) return;
    this.queued.add(url);
    if (front) this.queue.unshift(url);
    else this.queue.push(url);
    this.reportQueue();
  }

  reportQueue() {
    if (this.tracker) this.tracker.tick({ queue: this.queue.length, ...this.stats });
  }

  log(msg, level = 'info') {
    if (this.tracker) this.tracker.log(msg, level);
  }

  tick(extra = {}) {
    if (this.tracker) {
      this.tracker.tick({
        pages: this.stats.pages, assets: this.stats.assets, bytes: this.stats.bytes,
        errors: this.stats.errors, queue: this.queue.length, ...extra
      });
    }
  }

  isAssetUrl(url) {
    const ext = getExtension(url);
    return ASSET_EXT.has(ext);
  }

  extractUrls($, pageUrl) {
    const found = new Set();
    for (const sel of SELECTORS) {
      $(sel).each((_, el) => {
        for (const attr of ['href', 'src', 'data', 'action', 'content', 'poster']) {
          const val = $(el).attr(attr);
          if (val) { const r = resolveUrl(val, pageUrl); if (r) found.add(r); }
        }
        const srcset = $(el).attr('srcset');
        if (srcset) {
          srcset.split(',').forEach(part => {
            const r = resolveUrl(part.trim().split(/\s+/)[0], pageUrl);
            if (r) found.add(r);
          });
        }
      });
    }
    const inline = [$('style').html(), $('[style]').map((_, e) => $(e).attr('style')).get().join(' ')].join('\n');
    let m;
    const urlRegex = /url\(\s*['"]?([^'")]+)['"]?\s*\)/gi;
    while ((m = urlRegex.exec(inline)) !== null) {
      const r = resolveUrl(m[1], pageUrl);
      if (r) found.add(r);
    }
    return [...found];
  }

  extractFromJs(code, pageUrl) {
    const found = new Set();
    for (const regex of JS_URL_PATTERNS) {
      const re = new RegExp(regex.source, regex.flags);
      let match;
      while ((match = re.exec(code)) !== null) {
        const r = resolveUrl(match[1], pageUrl);
        if (r) found.add(r);
      }
    }
    return [...found];
  }

  parseCssImports(css, cssUrl) {
    const found = new Set();
    const importRe = /@import\s+(?:url\()?['"]?([^'")\s;]+)['"]?\)?/gi;
    let m;
    while ((m = importRe.exec(css)) !== null) {
      const r = resolveUrl(m[1], cssUrl);
      if (r) found.add(r);
    }
    const urlRe = /url\(\s*['"]?([^'")]+)['"]?\s*\)/gi;
    while ((m = urlRe.exec(css)) !== null) {
      if (!m[1].startsWith('data:')) {
        const r = resolveUrl(m[1], cssUrl);
        if (r) found.add(r);
      }
    }
    return [...found];
  }

  queueAssets(urls, pageUrl) {
    for (const u of urls) {
      if (this.isAssetUrl(u) || !isSameOrigin(u, this.targetInfo.origin)) {
        this.scheduleAsset(u);
      } else if (isSameOrigin(u, this.targetInfo.origin)) {
        this.pushQueue(u);
      }
    }
  }

  scheduleAsset(url) {
    if (this.downloaded.has(url)) return;
    this.assetLimiter.schedule(() => this.downloadAsset(url)).catch(() => {});
  }

  async saveContent(url, content, contentType) {
    const localPath = urlToLocalPath(url, this.outputDir, this.targetInfo.hostname);
    const dir = path.dirname(localPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const ext = path.extname(localPath);
    const cssImports = [];

    if (contentType.includes('text/html') || ext === '.html' || ext === '.htm' || ext === '.php') {
      let html = Buffer.isBuffer(content) ? content.toString('utf-8') : content;
      html = rewriteHtmlLinks(html, url, this.outputDir, this.targetInfo.hostname);
      html = injectHtmlWatermark(html);
      content = Buffer.from(html, 'utf-8');
      this.stats.pages++;
    } else if (contentType.includes('text/css') || ext === '.css') {
      let css = Buffer.isBuffer(content) ? content.toString('utf-8') : content;
      cssImports.push(...this.parseCssImports(css, url));
      css = rewriteCssUrls(css, url, this.outputDir, this.targetInfo.hostname);
      css = injectCssWatermark(css);
      content = Buffer.from(css, 'utf-8');
      this.stats.assets++;
    } else if (contentType.includes('javascript') || ext === '.js' || ext === '.mjs') {
      let js = Buffer.isBuffer(content) ? content.toString('utf-8') : content;
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
    for (const imp of cssImports) this.scheduleAsset(imp);
    return entry;
  }

  async downloadAsset(url, retries = 0) {
    if (this.downloaded.has(url)) return this.downloaded.get(url);
    if (!isDownloadableAsset(url) && !isSameOrigin(url, this.targetInfo.origin)) {
      this.stats.skipped++;
      return null;
    }
    try {
      const { status, data, headers } = await fastGetBuffer(this.http, url);
      if (status >= 400) {
        this.stats.errors++;
        this.errors.push({ url, status });
        return null;
      }
      return await this.saveContent(url, data, headers['content-type'] || '');
    } catch (e) {
      if (retries < this.mode.retries) {
        await new Promise(r => setTimeout(r, 500 * (retries + 1)));
        return this.downloadAsset(url, retries + 1);
      }
      this.stats.errors++;
      this.errors.push({ url, error: e.message });
      return null;
    }
  }

  parseHtml(html, url) {
    const $ = cheerio.load(html);
    const discovered = new Set(this.extractUrls($, url));
    $('script:not([src])').each((_, el) => {
      this.extractFromJs($(el).html() || '', url).forEach(u => discovered.add(u));
    });
    return [...discovered];
  }

  async fetchPageFast(url) {
    try {
      const { status, data, headers } = await fastGetText(this.http, url);
      if (status >= 400) return null;
      const html = typeof data === 'string' ? data : String(data);
      if (needsBrowserRender(html)) return null;
      this.stats.fastHits++;
      const urls = this.parseHtml(html, url);
      await this.saveContent(url, html, headers['content-type'] || 'text/html');
      return urls;
    } catch {
      return null;
    }
  }

  async initBrowser() {
    if (this.browser) return;
    this.log('Launching Playwright for SPA/JS pages...');
    this.browser = await chromium.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage']
    });
    const ctx = await this.browser.newContext({
      viewport: { width: 1920, height: 1080 },
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
      ignoreHTTPSErrors: true
    });
    this.page = await ctx.newPage();
    this.page.on('response', r => {
      const u = r.url().split('#')[0];
      if (r.status() < 400) {
        this.stats.networkHits++;
        if (!this.downloaded.has(u) && r.request().resourceType() !== 'document') {
          this.scheduleAsset(u);
        }
        if (isSameOrigin(u, this.targetInfo.origin) && !this.visited.has(u)) {
          this.pushQueue(u);
        }
      }
    });
  }

  async spaScroll() {
    if (!this.mode.scroll || !this.page) return;
    try {
      await this.page.evaluate(async () => {
        await new Promise(resolve => {
          let y = 0;
          const step = () => {
            const h = document.body?.scrollHeight || 0;
            window.scrollBy(0, 600);
            y += 600;
            if (y < h && y < 12000) setTimeout(step, 80);
            else resolve();
          };
          step();
        });
      });
      await this.page.waitForTimeout(300);
    } catch {}
  }

  async fetchPageBrowser(url) {
    await this.initBrowser();
    try {
      await this.page.goto(url, { waitUntil: 'domcontentloaded', timeout: this.mode.timeout });
      await this.spaScroll();
      const html = await this.page.content();
      this.stats.browserHits++;
      const urls = this.parseHtml(html, url);
      await this.saveContent(url, html, 'text/html');
      return urls;
    } catch (e) {
      this.stats.errors++;
      this.errors.push({ url, error: e.message, phase: 'browser' });
      return [];
    }
  }

  async processPage(url) {
    this.visited.add(url);
    this.tick({ current: this.stats.pages, total: this.limit, url });

    let discovered = await this.fetchPageFast(url);
    if (!discovered) {
      this.log(`Browser render → ${url.slice(0, 100)}`);
      discovered = await this.fetchPageBrowser(url);
    }
    this.queueAssets(discovered, url);
  }

  async run(maxPages) {
    this.limit = maxPages || this.mode.maxPages;
    const mirrorDir = path.join(this.outputDir, 'mirror', this.targetInfo.hostname.replace(/[^a-zA-Z0-9.-]/g, '_'));
    if (!fs.existsSync(mirrorDir)) fs.mkdirSync(mirrorDir, { recursive: true });

    if (this.tracker) this.tracker.setPhase('seeding', this.limit);
    this.log('HYBRID ENGINE: fast HTTP + Playwright SPA fallback');
    this.log(`Threads: ${this.concurrent} pages | ${this.mode.assetThreads} assets`);

    const seeds = await fetchSeedUrls(this.target);
    seeds.forEach(u => this.pushQueue(u));
    this.log(`Seeded ${seeds.length} URLs from robots/sitemap`);

    if (this.tracker) this.tracker.setPhase('mirroring', this.limit);

    this._heartbeat = setInterval(() => {
      if (this.tracker?.live) this.tracker.live.heartbeat();
    }, 45000);

    const startWait = Date.now();
    while (
      (this.queue.length > 0 || this.assetLimiter.counts().EXECUTING > 0) &&
      this.stats.pages < this.limit &&
      this.downloaded.size < this.mode.maxAssets
    ) {
      const url = this.queue.shift();
      if (!url) {
        if (Date.now() - startWait > 15000 && this.queue.length === 0) break;
        await new Promise(r => setTimeout(r, 200));
        this.reportQueue();
        continue;
      }
      if (this.visited.has(url)) continue;

      if (!isSameOrigin(url, this.targetInfo.origin)) {
        this.scheduleAsset(url);
        continue;
      }

      await this.pageLimiter.schedule(() => this.processPage(url));
    }

    clearInterval(this._heartbeat);
    await this.assetLimiter.stop({ dropWaitingJobs: false });
    if (this.browser) await this.browser.close();

    this.log(`Engine stats: ${this.stats.fastHits} fast HTTP | ${this.stats.browserHits} browser | ${this.stats.networkHits} network`);

    const manifest = {
      target: this.target, hostname: this.targetInfo.hostname, mirrorPath: mirrorDir,
      timestamp: new Date().toISOString(), mode: this.mode, stats: this.stats,
      files: [...this.downloaded.values()].map(d => ({
        url: d.url,
        local: path.relative(this.outputDir, d.localPath).replace(/\\/g, '/'),
        size: d.size, contentType: d.contentType
      })),
      errors: this.errors.slice(0, 1000)
    };

    fs.writeFileSync(path.join(this.outputDir, 'mirror-manifest.json'), JSON.stringify(manifest, null, 2));
    this.log(`DONE: ${this.stats.pages} pages | ${this.stats.assets} assets`);
    return manifest;
  }
}

export default WebsiteDownloader;
