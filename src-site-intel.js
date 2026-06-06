import axios from 'axios';
import { parseTarget } from './src-path-resolver.js';

export async function gatherSiteIntel(targetUrl) {
  const { origin, hostname, protocol } = parseTarget(targetUrl);
  const intel = {
    url: targetUrl,
    hostname,
    protocol,
    timestamp: new Date().toISOString(),
    headers: {},
    security: {},
    dns: {},
    performance: {}
  };

  const start = Date.now();
  try {
    const res = await axios.get(targetUrl, {
      timeout: 15000,
      maxRedirects: 5,
      validateStatus: () => true,
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; ZygorScarper/3.0; +instagram:@zygorlap)' }
    });

    intel.status = res.status;
    intel.finalUrl = res.request?.res?.responseUrl || targetUrl;
    intel.headers = sanitize(res.headers);
    intel.performance.ttfb = Date.now() - start;
    intel.performance.contentLength = res.headers['content-length'] || (typeof res.data === 'string' ? res.data.length : 0);

    intel.security = {
      hsts: !!res.headers['strict-transport-security'],
      csp: !!res.headers['content-security-policy'],
      xframe: res.headers['x-frame-options'] || null,
      xss: res.headers['x-xss-protection'] || null,
      referrer: res.headers['referrer-policy'] || null,
      permissions: res.headers['permissions-policy'] || null,
      https: protocol === 'https:',
      cookies: parseCookies(res.headers['set-cookie'])
    };

    intel.tech_hints = {
      server: res.headers['server'],
      poweredBy: res.headers['x-powered-by'],
      generator: extractGenerator(res.data),
      cache: res.headers['cache-control']
    };
  } catch (e) {
    intel.error = e.message;
  }

  return intel;
}

function sanitize(headers) {
  const safe = {};
  const keys = ['server', 'content-type', 'x-powered-by', 'cache-control', 'etag', 'last-modified', 'cf-ray', 'x-vercel-id', 'x-nf-request-id'];
  for (const k of keys) if (headers[k]) safe[k] = headers[k];
  return safe;
}

function parseCookies(setCookie) {
  if (!setCookie) return [];
  const arr = Array.isArray(setCookie) ? setCookie : [setCookie];
  return arr.map(c => {
    const parts = c.split(';').map(p => p.trim());
    const [name] = parts[0].split('=');
    return {
      name,
      secure: parts.some(p => p.toLowerCase() === 'secure'),
      httpOnly: parts.some(p => p.toLowerCase() === 'httponly'),
      sameSite: parts.find(p => p.toLowerCase().startsWith('samesite'))?.split('=')[1] || null
    };
  });
}

function extractGenerator(data) {
  if (typeof data !== 'string') return null;
  const m = data.match(/<meta[^>]+name=["']generator["'][^>]+content=["']([^"']+)["']/i);
  return m ? m[1] : null;
}

export default { gatherSiteIntel };
