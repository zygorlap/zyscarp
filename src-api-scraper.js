import axios from 'axios';
import * as cheerio from 'cheerio';
import fs from 'fs';
import path from 'path';
import { resolveUrl, parseTarget } from './src-path-resolver.js';

export class ThunderAPIScraper {
  constructor(targetUrl, mirrorManifest = null, outputDir = './output') {
    this.target = targetUrl;
    this.targetInfo = parseTarget(targetUrl);
    this.mirrorManifest = mirrorManifest;
    this.outputDir = outputDir;
    this.apis = [];
    this.endpoints = [];
    this.responses = [];
    this.errors = [];
    this.seen = new Set();
  }

  addEndpoint(endpoint, source) {
    const key = typeof endpoint === 'string' ? endpoint : endpoint.path || endpoint;
    if (!key || this.seen.has(key)) return;
    this.seen.add(key);
    this.endpoints.push({ path: key, source, discovered: new Date().toISOString() });
  }

  extractFromJS(jsCode, source = 'js') {
    const patterns = [
      { name: 'fetch', regex: /fetch\s*\(\s*[`'"]([^`'"]+)[`'"]/g },
      { name: 'axios_get', regex: /axios\s*\.\s*get\s*\(\s*[`'"]([^`'"]+)[`'"]/g },
      { name: 'axios_post', regex: /axios\s*\.\s*post\s*\(\s*[`'"]([^`'"]+)[`'"]/g },
      { name: 'axios_put', regex: /axios\s*\.\s*put\s*\(\s*[`'"]([^`'"]+)[`'"]/g },
      { name: 'axios_delete', regex: /axios\s*\.\s*delete\s*\(\s*[`'"]([^`'"]+)[`'"]/g },
      { name: 'xhr', regex: /\.open\s*\(\s*['"][A-Z]+['"]\s*,\s*[`'"]([^`'"]+)[`'"]/g },
      { name: 'api_path', regex: /['"`](\/api\/[a-z0-9\-_/.?=&%]+)['"`]/gi },
      { name: 'graphql', regex: /['"`]([^'"`]*\/graphql[^'"`]*)['"`]/gi },
      { name: 'rest_api', regex: /['"`](\/rest\/[a-z0-9\-_/.]+)['"`]/gi },
      { name: 'v1_api', regex: /['"`](\/v[0-9]+\/[a-z0-9\-_/.]+)['"`]/gi },
      { name: 'json_endpoint', regex: /['"`](\/[a-z0-9\-_/]*\.json[^'"`]*)['"`]/gi },
      { name: 'websocket', regex: /wss?:\/\/[a-z0-9\-._~:/?#[\]@!$&'()*+,;=%]+/gi },
      { name: 'base_url', regex: /baseURL\s*[:=]\s*[`'"]([^`'"]+)[`'"]/gi },
      { name: 'api_url', regex: /apiUrl\s*[:=]\s*[`'"]([^`'"]+)[`'"]/gi }
    ];

    for (const { name, regex } of patterns) {
      let match;
      while ((match = regex.exec(jsCode)) !== null) {
        const endpoint = match[1] || match[0];
        if (endpoint && endpoint.length < 500) this.addEndpoint(endpoint, `${source}:${name}`);
      }
    }
  }

  async scanDownloadedFiles() {
    if (!this.mirrorManifest?.files) return;
    for (const file of this.mirrorManifest.files) {
      const ext = path.extname(file.local).toLowerCase();
      if (!['.js', '.mjs', '.json', '.html', '.htm', '.php'].includes(ext)) continue;
      try {
        const fullPath = path.join(this.outputDir, file.local);
        if (!fs.existsSync(fullPath)) continue;
        const content = fs.readFileSync(fullPath, 'utf-8');
        if (!content) continue;
        if (ext === '.json') {
          try { this.extractFromObject(JSON.parse(content)); } catch {}
        } else if (['.html', '.htm', '.php'].includes(ext)) {
          await this.extractFromHTML(content);
        } else {
          this.extractFromJS(content, file.local);
        }
      } catch {}
    }
  }

  async scanCommonEndpoints() {
    const common = [
      '/api', '/api/v1', '/api/v2', '/api/v3',
      '/api/v1/users', '/api/v1/data', '/api/v1/config', '/api/v1/health',
      '/api/users', '/api/posts', '/api/comments', '/api/auth', '/api/profile',
      '/api/settings', '/api/search', '/api/public', '/api/info', '/api/status',
      '/api/health', '/api/version', '/api/docs', '/api/swagger', '/api/openapi',
      '/graphql', '/rest/api', '/api/graphql', '/api/mobile', '/api/app',
      '/api/webhook', '/api/integration', '/api/external', '/api/internal',
      '/.well-known/openapi.json', '/swagger.json', '/openapi.json',
      '/api/schema', '/api/routes', '/api/endpoints', '/api/metrics',
      '/wp-json/wp/v2', '/api/wp/v2', '/jsonapi', '/odata', '/rpc'
    ];

    const methods = ['GET', 'POST', 'OPTIONS'];
    for (const endpoint of common) {
      for (const method of methods) {
        try {
          const url = new URL(endpoint, this.target).href;
          const response = await axios({
            method,
            url,
            timeout: 6000,
            validateStatus: () => true,
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
              'Accept': 'application/json, text/plain, */*'
            }
          });

          if (response.status < 400 && response.data) {
            const size = typeof response.data === 'string' ? response.data.length : JSON.stringify(response.data).length;
            if (size > 0) {
              this.apis.push({
                endpoint,
                method,
                status: response.status,
                contentType: response.headers['content-type'],
                dataSize: size,
                discovered: new Date().toISOString()
              });
              this.responses.push({
                endpoint,
                method,
                status: response.status,
                preview: typeof response.data === 'object' ? JSON.stringify(response.data).slice(0, 2000) : String(response.data).slice(0, 2000),
                headers: this.sanitizeHeaders(response.headers)
              });
            }
          }
        } catch (e) {
          this.errors.push({ endpoint, method, error: e.message, timestamp: new Date().toISOString() });
        }
      }
    }
  }

  async extractFromHTML(html) {
    const $ = cheerio.load(html);
    $('meta[name="api-base"], meta[name="api-url"], meta[property="api:url"]').each((_, el) => {
      const content = $(el).attr('content');
      if (content) this.addEndpoint(content, 'meta-tag');
    });
    $('script[type="application/json"], script[type="application/ld+json"]').each((_, el) => {
      try { this.extractFromObject(JSON.parse($(el).html() || '{}')); } catch {}
    });
    $('script:not([src])').each((_, el) => {
      this.extractFromJS($(el).html() || '', 'inline-script');
    });
    $('script[src]').each((_, el) => {
      const src = $(el).attr('src');
      if (src) this.addEndpoint(resolveUrl(src, this.target) || src, 'script-src');
    });
    $('link[rel="alternate"][type="application/json"]').each((_, el) => {
      const href = $(el).attr('href');
      if (href) this.addEndpoint(href, 'json-alternate');
    });
  }

  extractFromObject(obj, depth = 0) {
    if (depth > 10 || !obj || typeof obj !== 'object') return;
    for (const [key, value] of Object.entries(obj)) {
      if (typeof value === 'string') {
        if (value.startsWith('/') || value.startsWith('http')) {
          if (value.includes('api') || value.includes('graphql') || value.endsWith('.json')) {
            this.addEndpoint(value, 'config-object');
          }
        }
      } else if (typeof value === 'object') {
        this.extractFromObject(value, depth + 1);
      }
    }
  }

  sanitizeHeaders(headers) {
    const safe = { ...headers };
    ['authorization', 'cookie', 'x-api-key', 'x-token', 'set-cookie'].forEach(k => delete safe[k]);
    return safe;
  }

  async probeDiscoveredEndpoints() {
    for (const ep of this.endpoints.slice(0, 200)) {
      try {
        const url = ep.path.startsWith('http') ? ep.path : new URL(ep.path, this.target).href;
        const response = await axios.get(url, {
          timeout: 5000,
          validateStatus: () => true,
          headers: { 'User-Agent': 'Mozilla/5.0', 'Accept': 'application/json, */*' }
        });
        if (response.status < 400) {
          this.apis.push({
            endpoint: ep.path,
            method: 'GET',
            status: response.status,
            contentType: response.headers['content-type'],
            source: ep.source,
            discovered: new Date().toISOString()
          });
        }
      } catch {}
    }
  }

  async scan() {
    try {
      const response = await axios.get(this.target, {
        timeout: 20000,
        validateStatus: () => true,
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
      });
      if (response.status === 200) await this.extractFromHTML(response.data);
      await this.scanDownloadedFiles();
      await this.scanCommonEndpoints();
      await this.probeDiscoveredEndpoints();
      return {
        apis: this.apis,
        endpoints: this.endpoints,
        responses: this.responses,
        errors: this.errors,
        stats: {
          total_endpoints: this.endpoints.length,
          responding_apis: this.apis.length,
          errors: this.errors.length
        }
      };
    } catch (e) {
      return { apis: [], endpoints: [], responses: [], errors: [{ error: e.message }], stats: {} };
    }
  }
}

export default ThunderAPIScraper;
