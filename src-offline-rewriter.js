import * as cheerio from 'cheerio';
import { resolveUrl, urlToLocalPath, urlToRelativePath } from './src-path-resolver.js';

const LINK_ATTRS = ['href', 'src', 'data', 'action', 'content', 'poster'];
const REWRITE_SELECTORS = 'a[href], link[href], script[src], img[src], source[src], video[src], audio[src], embed[src], object[data], iframe[src], form[action], img[srcset], source[srcset]';

export function rewriteHtmlLinks(html, pageUrl, outputDir, hostname) {
  const $ = cheerio.load(html, { decodeEntities: false });
  const localPath = urlToLocalPath(pageUrl, outputDir, hostname);

  $(REWRITE_SELECTORS).each((_, el) => {
    for (const attr of LINK_ATTRS) {
      const val = $(el).attr(attr);
      if (!val || val.startsWith('data:') || val.startsWith('#') || val.startsWith('javascript:')) continue;
      const resolved = resolveUrl(val, pageUrl);
      if (resolved) {
        const relative = urlToRelativePath(localPath, resolved, outputDir, hostname);
        $(el).attr(attr, relative);
      }
    }
    const srcset = $(el).attr('srcset');
    if (srcset) {
      const rewritten = srcset.split(',').map(part => {
        const [u, descriptor] = part.trim().split(/\s+/);
        const resolved = resolveUrl(u, pageUrl);
        if (!resolved) return part.trim();
        const relative = urlToRelativePath(localPath, resolved, outputDir, hostname);
        return descriptor ? `${relative} ${descriptor}` : relative;
      }).join(', ');
      $(el).attr('srcset', rewritten);
    }
  });

  $('style').each((_, el) => {
    const css = $(el).html() || '';
    $(el).html(rewriteCssUrls(css, pageUrl, outputDir, hostname));
  });

  return $.html();
}

export function rewriteCssUrls(css, cssUrl, outputDir, hostname) {
  const localPath = urlToLocalPath(cssUrl, outputDir, hostname);
  return css.replace(/url\(\s*['"]?([^'")]+)['"]?\s*\)/gi, (match, rawUrl) => {
    if (rawUrl.startsWith('data:') || rawUrl.startsWith('#')) return match;
    const resolved = resolveUrl(rawUrl, cssUrl);
    if (!resolved) return match;
    const relative = urlToRelativePath(localPath, resolved, outputDir, hostname);
    return `url("${relative}")`;
  });
}

export default { rewriteHtmlLinks, rewriteCssUrls };
