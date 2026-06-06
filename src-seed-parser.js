import axios from 'axios';
import * as cheerio from 'cheerio';
import { resolveUrl, parseTarget } from './src-path-resolver.js';

export async function fetchSeedUrls(targetUrl) {
  const seeds = new Set([targetUrl]);
  const { origin, hostname } = parseTarget(targetUrl);

  const paths = [
    '/robots.txt',
    '/sitemap.xml',
    '/sitemap_index.xml',
    '/sitemap-index.xml',
    '/wp-sitemap.xml',
    '/sitemap/sitemap.xml'
  ];

  for (const p of paths) {
    try {
      const url = new URL(p, origin).href;
      const res = await axios.get(url, { timeout: 8000, validateStatus: s => s < 500 });
      if (res.status !== 200 || !res.data) continue;

      if (p.includes('robots')) {
        parseRobots(String(res.data), origin).forEach(u => seeds.add(u));
      } else {
        const urls = await parseSitemap(String(res.data), origin);
        urls.forEach(u => seeds.add(u));
      }
    } catch {}
  }

  return [...seeds].filter(u => {
    try { return new URL(u).hostname === hostname; } catch { return false; }
  });
}

function parseRobots(text, origin) {
  const urls = [];
  const lines = text.split('\n');
  let inAgent = false;
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.toLowerCase().startsWith('user-agent:')) {
      const agent = trimmed.split(':')[1]?.trim();
      inAgent = !agent || agent === '*';
    }
    if (inAgent && trimmed.toLowerCase().startsWith('sitemap:')) {
      const sm = trimmed.split(':').slice(1).join(':').trim();
      urls.push(sm.startsWith('http') ? sm : new URL(sm, origin).href);
    }
    if (inAgent && trimmed.toLowerCase().startsWith('allow:')) {
      const path = trimmed.split(':').slice(1).join(':').trim();
      if (path) urls.push(new URL(path, origin).href);
    }
  }
  return urls;
}

async function parseSitemap(xml, origin, depth = 0) {
  if (depth > 3) return [];
  const urls = [];
  const $ = cheerio.load(xml, { xmlMode: true });

  $('sitemap loc').each((_, el) => {
    const loc = $(el).text().trim();
    if (loc) urls.push(loc);
  });

  const nested = [];
  for (const sm of urls.filter(u => u.endsWith('.xml'))) {
    try {
      const res = await axios.get(sm, { timeout: 8000, validateStatus: s => s < 500 });
      if (res.status === 200) nested.push(...await parseSitemap(String(res.data), origin, depth + 1));
    } catch {}
  }

  $('url loc').each((_, el) => {
    const loc = $(el).text().trim();
    if (loc) nested.push(loc.startsWith('http') ? loc : resolveUrl(loc, origin));
  });

  return nested.filter(Boolean);
}

export default { fetchSeedUrls };
