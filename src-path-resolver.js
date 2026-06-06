import path from 'path';
import { URL } from 'url';

const ASSET_EXTENSIONS = new Set([
  '.html', '.htm', '.php', '.asp', '.aspx', '.jsp',
  '.css', '.scss', '.less',
  '.js', '.mjs', '.jsx', '.ts', '.tsx',
  '.json', '.xml', '.sql', '.txt', '.csv',
  '.jpg', '.jpeg', '.png', '.gif', '.svg', '.webp', '.ico', '.bmp', '.avif',
  '.woff', '.woff2', '.ttf', '.eot', '.otf',
  '.mp4', '.webm', '.mp3', '.wav', '.ogg',
  '.pdf', '.zip', '.map'
]);

export function parseTarget(targetUrl) {
  const parsed = new URL(targetUrl);
  return {
    origin: parsed.origin,
    hostname: parsed.hostname,
    protocol: parsed.protocol,
    base: parsed.href.endsWith('/') ? parsed.href : parsed.origin + '/'
  };
}

export function isSameOrigin(url, origin) {
  try {
    return new URL(url).origin === origin;
  } catch {
    return false;
  }
}

export function resolveUrl(href, baseUrl) {
  if (!href || href.startsWith('data:') || href.startsWith('blob:') || href.startsWith('javascript:') || href.startsWith('mailto:') || href.startsWith('tel:') || href.startsWith('#')) {
    return null;
  }
  try {
    return new URL(href, baseUrl).href.split('#')[0];
  } catch {
    return null;
  }
}

export function urlToLocalPath(url, outputDir, hostname) {
  const parsed = new URL(url);
  let pathname = decodeURIComponent(parsed.pathname);
  if (pathname.endsWith('/')) pathname += 'index.html';
  if (!path.extname(pathname)) pathname += '.html';
  const safeHost = hostname.replace(/[^a-zA-Z0-9.-]/g, '_');
  return path.join(outputDir, 'mirror', safeHost, pathname);
}

export function urlToRelativePath(fromLocalPath, toUrl, outputDir, hostname) {
  const toLocal = urlToLocalPath(toUrl, outputDir, hostname);
  const fromDir = path.dirname(fromLocalPath);
  let relative = path.relative(fromDir, toLocal).replace(/\\/g, '/');
  if (!relative.startsWith('.')) relative = './' + relative;
  return relative;
}

export function getExtension(url) {
  try {
    const pathname = new URL(url).pathname;
    const ext = path.extname(pathname).toLowerCase();
    return ext || '.html';
  } catch {
    return '.html';
  }
}

export function isDownloadableAsset(url) {
  const ext = getExtension(url);
  if (ASSET_EXTENSIONS.has(ext)) return true;
  try {
    const p = new URL(url).pathname;
    return !p.includes('.') || ext === '.html';
  } catch {
    return false;
  }
}

export function sanitizeFilename(name) {
  return name.replace(/[<>:"|?*]/g, '_').replace(/\.\./g, '_');
}

export function contentTypeToExt(contentType) {
  const map = {
    'text/html': '.html',
    'text/css': '.css',
    'application/javascript': '.js',
    'text/javascript': '.js',
    'application/json': '.json',
    'image/jpeg': '.jpg',
    'image/png': '.png',
    'image/gif': '.gif',
    'image/svg+xml': '.svg',
    'image/webp': '.webp',
    'image/x-icon': '.ico',
    'font/woff': '.woff',
    'font/woff2': '.woff2',
    'application/pdf': '.pdf',
    'text/xml': '.xml',
    'application/xml': '.xml'
  };
  for (const [type, ext] of Object.entries(map)) {
    if (contentType && contentType.includes(type)) return ext;
  }
  return null;
}

export default {
  parseTarget,
  isSameOrigin,
  resolveUrl,
  urlToLocalPath,
  urlToRelativePath,
  getExtension,
  isDownloadableAsset,
  sanitizeFilename,
  contentTypeToExt
};
