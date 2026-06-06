import axios from 'axios';
import http from 'http';
import https from 'https';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';

const httpAgent = new http.Agent({ keepAlive: true, maxSockets: 64 });
const httpsAgent = new https.Agent({ keepAlive: true, maxSockets: 64 });

export function createFastClient(origin, timeout = 25000) {
  return axios.create({
    timeout,
    maxRedirects: 8,
    responseType: 'arraybuffer',
    validateStatus: s => s < 500,
    httpAgent,
    httpsAgent,
    headers: {
      'User-Agent': UA,
      'Accept': '*/*',
      'Accept-Language': 'en-US,en;q=0.9',
      'Accept-Encoding': 'gzip, deflate, br',
      'Referer': origin,
      'Connection': 'keep-alive'
    }
  });
}

export async function fastGetText(client, url) {
  const res = await client.get(url, { responseType: 'text', transformResponse: [d => d] });
  return { status: res.status, data: res.data, headers: res.headers };
}

export async function fastGetBuffer(client, url) {
  const res = await client.get(url);
  return { status: res.status, data: res.data, headers: res.headers };
}

export function needsBrowserRender(html) {
  if (!html || html.length < 200) return true;
  const h = html.toLowerCase();
  if (h.includes('__next') || h.includes('__nuxt') || h.includes('data-reactroot')) return true;
  if (h.includes('ng-app') || h.includes('ng-version')) return true;
  if (h.includes('id="app"') && html.length < 5000) return true;
  if ((h.match(/<a\s/g) || []).length < 2 && html.length < 8000) return true;
  return false;
}

export default { createFastClient, fastGetText, fastGetBuffer, needsBrowserRender };
