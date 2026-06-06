import WebsiteDownloader from './src-website-downloader.js';
import CoreCrawler from './src-core-crawler.js';
import ThunderAPIScraper from './src-api-scraper.js';
import SecretExtractor from './src-secret-extractor.js';
import ErrorBypass from './src-error-bypass.js';
import { buildSitemap, buildOfflineIndex } from './src-sitemap-builder.js';
import { generateReport } from './src-report-generator.js';
import { DISCLAIMER, WATERMARK, brandBanner } from './src-watermark.js';
import { ProgressTracker } from './src-progress.js';
import { LiveLogger } from './src-live-logger.js';
import { gatherSiteIntel } from './src-site-intel.js';
import { detectTech } from './src-tech-detector.js';
import { captureScreenshots } from './src-screenshot.js';
import { createMirrorZip } from './src-archiver.js';
import fs from 'fs';
import path from 'path';
import axios from 'axios';
import { fileURLToPath } from 'url';

const maxPagesMap = { light: 50, fast: 500, complete: 2000, aggressive: 10000, nuclear: 50000 };

function envBool(key, def) {
  const v = process.env[key];
  if (v === undefined) return def;
  return v !== 'false' && v !== '0';
}

function loadConfig() {
  const mode = process.env.MODE || 'fast';
  return {
    mode,
    maxPages: parseInt(process.env.MAX_PAGES || maxPagesMap[mode] || '500', 10),
    concurrent: parseInt(process.env.CONCURRENT || '16', 10),
    outputDir: process.env.OUTPUT_DIR || './output',
    enableDownload: envBool('DOWNLOAD', true),
    enableCrawl: envBool('CRAWL', true),
    enableApiScraping: envBool('API_SCRAPING', true),
    enableSecretExtraction: envBool('SECRET_EXTRACTION', true),
    enableErrorBypass: envBool('ERROR_BYPASS', true),
    enableScreenshots: envBool('SCREENSHOTS', true),
    enableZip: envBool('ZIP', true),
    enableIntel: envBool('INTEL', true)
  };
}

export class ZygorScarper {
  constructor(config = {}) {
    this.config = { ...loadConfig(), ...config };
    this.errorBypass = new ErrorBypass(8, 1500);
    this.live = new LiveLogger(this.config.outputDir);
    this.tracker = new ProgressTracker(this.live);
    this.results = {};
    this._startTime = Date.now();
  }

  async withBypass(fn) {
    if (this.config.enableErrorBypass) return this.errorBypass.executeWithBypass(fn);
    return fn();
  }

  async run(targetUrl) {
    console.log(brandBanner());
    this.live.out(`Target: ${targetUrl}`);
    this.live.out(`Mode: ${this.config.mode} | Max pages: ${this.config.maxPages} | Threads: ${this.config.concurrent}`);
    this.live.out(`Output: ${path.resolve(this.config.outputDir)}`);
    this.live.ghaNotice('Zygor Scarper Started', `${targetUrl} | mode=${this.config.mode}`);

    if (!fs.existsSync(this.config.outputDir)) fs.mkdirSync(this.config.outputDir, { recursive: true });
    fs.writeFileSync(path.join(this.config.outputDir, 'DISCLAIMER.txt'), DISCLAIMER);

    try {
      if (this.config.enableIntel) {
        this.live.phase('site intelligence');
        this.tracker.setPhase('intel');
        this.results.intel = await this.withBypass(() => gatherSiteIntel(targetUrl));
        try {
          const r = await axios.get(targetUrl, { timeout: 15000, validateStatus: () => true });
          const html = typeof r.data === 'string' ? r.data : '';
          this.results.tech = detectTech(html, this.results.intel?.headers || {}, []);
        } catch {}
        this.live.success(`Server: ${this.results.intel?.headers?.server || 'unknown'} | TTFB: ${this.results.intel?.performance?.ttfb || 0}ms`);
        if (this.results.tech?.stack?.length) {
          this.live.out(`Tech: ${this.results.tech.stack.map(t => t.name).join(', ')}`);
        }
      }

      if (this.config.enableDownload) {
        this.live.phase('website mirror', `hybrid engine | max ${this.config.maxPages} pages`);
        await this.withBypass(async () => {
          const downloader = new WebsiteDownloader(
            targetUrl, this.config.mode, this.config.concurrent,
            this.config.outputDir, this.tracker
          );
          this.results.mirror = await downloader.run(this.config.maxPages);
        });
        this.live.success(`Mirror: ${this.results.mirror.stats.pages} pages | ${this.results.mirror.stats.assets} assets | ${fmt(this.results.mirror.stats.bytes)}`);
        buildSitemap(this.results.mirror, this.config.outputDir);
        buildOfflineIndex(this.results.mirror, this.config.outputDir, this.results);

        if (this.config.enableScreenshots) {
          this.live.phase('screenshots');
          const pageUrls = this.results.mirror.files.filter(f => /\.(html?|php)$/i.test(f.local)).map(f => f.url);
          this.results.screenshots = await captureScreenshots(pageUrls, this.config.outputDir, 25);
          this.live.success(`${this.results.screenshots.length} screenshots`);
        }

        if (this.config.enableZip) {
          this.live.phase('zip archive');
          this.results.zip = await createMirrorZip(this.config.outputDir);
          if (this.results.zip) this.live.success(`mirror.zip (${fmt(this.results.zip.size)})`);
        }
      }

      if (this.config.enableCrawl) {
        this.live.phase('deep crawl', `max ${this.config.maxPages}`);
        this.tracker.setPhase('crawling', this.config.maxPages);
        await this.withBypass(async () => {
          const crawler = new CoreCrawler(targetUrl, this.config.mode, this.config.concurrent);
          this.results.crawl = await crawler.crawl(this.config.maxPages);
        });
        this.live.success(`Crawled ${this.results.crawl.stats.pages} pages | ${this.results.crawl.stats.links} links`);
      }

      if (this.config.enableApiScraping) {
        this.live.phase('api discovery');
        this.tracker.setPhase('api-scan');
        await this.withBypass(async () => {
          const scraper = new ThunderAPIScraper(targetUrl, this.results.mirror || null, this.config.outputDir);
          this.results.apis = await scraper.scan();
        });
        this.live.success(`${this.results.apis.stats.total_endpoints} endpoints | ${this.results.apis.stats.responding_apis} live`);
      }

      if (this.config.enableSecretExtraction) {
        this.live.phase('security scan');
        this.tracker.setPhase('security');
        await this.withBypass(async () => {
          const extractor = new SecretExtractor();
          if (this.results.mirror) extractor.scanMirror(this.results.mirror, this.config.outputDir);
          if (this.results.crawl) {
            for (const page of this.results.crawl.pages.slice(0, 150)) {
              try {
                const r = await fetch(page.url);
                extractor.extract(await r.text(), page.url);
              } catch {}
            }
          }
          if (this.results.apis?.responses) {
            for (const r of this.results.apis.responses) {
              extractor.extract(JSON.stringify(r.preview || ''), r.endpoint);
            }
          }
          this.results.secrets = extractor.getReport();
        });
        this.live.success(`${this.results.secrets.totalSecrets} findings (${this.results.secrets.bySeverity.CRITICAL} critical)`);
      }

      this.results.errorLog = this.errorBypass.getErrorReport();
      this.results.duration = Math.round((Date.now() - this._startTime) / 1000);
      this.saveResults();
      generateReport(this.results, this.config.outputDir);
      this.live.ghaNotice('COMPLETE', `${this.results.mirror?.stats?.pages || 0} pages in ${this.results.duration}s`);
      this.live.close();
      this.printSummary();
      return this.results;
    } catch (e) {
      this.live.error(`Fatal: ${e.message}`);
      this.live.close();
      process.exitCode = 1;
      return { error: e };
    }
  }

  saveResults() {
    const dir = this.config.outputDir;
    const write = (name, data) => fs.writeFileSync(path.join(dir, name), JSON.stringify(data, null, 2));
    if (this.results.crawl) write('crawl-results.json', this.results.crawl);
    if (this.results.apis) write('api-results.json', this.results.apis);
    if (this.results.secrets) write('secrets-report.json', this.results.secrets);
    if (this.results.intel) write('site-intel.json', this.results.intel);
    if (this.results.tech) write('tech-stack.json', this.results.tech);
    if (this.results.screenshots) write('screenshots.json', this.results.screenshots);
    write('error-log.json', this.errorBypass.getErrorReport());
    write('meta.json', {
      tool: WATERMARK.brand, instagram: WATERMARK.instagram,
      version: WATERMARK.version, timestamp: new Date().toISOString(),
      duration: this.results.duration, config: this.config
    });
  }

  printSummary() {
    console.log('='.repeat(56));
    console.log(`${WATERMARK.brand} v${WATERMARK.version} COMPLETE`);
    console.log(`instagram:${WATERMARK.instagram} | ${this.results.duration}s`);
    if (this.results.mirror) console.log(`Mirror: ${this.results.mirror.stats.pages} pages | ${fmt(this.results.mirror.stats.bytes)}`);
    console.log('='.repeat(56));
  }
}

function fmt(bytes) {
  if (!bytes) return '0 B';
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / 1048576).toFixed(2) + ' MB';
}

const isMain = process.argv[1] && path.resolve(fileURLToPath(import.meta.url)) === path.resolve(process.argv[1]);

if (isMain) {
  const url = process.argv[2];
  if (!url) {
    console.error('Usage: node orchestrator.js <url>');
    process.exit(1);
  }
  new ZygorScarper().run(url);
}

export default ZygorScarper;
