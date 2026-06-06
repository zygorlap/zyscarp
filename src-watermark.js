export const WATERMARK = {
  brand: 'Zygor Scarper',
  instagram: '@zygorlap',
  tagline: 'The Ultimate Free Website Mirror & Intelligence Suite',
  version: '3.0.0'
};

export const DISCLAIMER = `ZYGOR SCARPER - LEGAL DISCLAIMER
================================

Built by instagram:@zygorlap | Free & Open Source

IMPORTANT: This tool is provided for EDUCATIONAL and AUTHORIZED use ONLY.

You MUST obtain explicit written permission from website owners before
downloading, mirroring, or scraping any website or its assets.

Unauthorized use may violate:
  - Computer Fraud and Abuse Act (CFAA) and similar laws worldwide
  - Website Terms of Service and robots.txt directives
  - Copyright and intellectual property rights
  - GDPR, CCPA, and other data protection regulations

THE AUTHORS AND CONTRIBUTORS (@zygorlap) EXPRESSLY DISCLAIM ALL LIABILITY
for any misuse, damages, legal consequences, or losses arising from the
use of this software. Users bear FULL RESPONSIBILITY for their actions.

By using Zygor Scarper you acknowledge that you have read, understood,
and agree to comply with all applicable laws and obtain proper authorization.

Report issues: instagram:@zygorlap
`;

export function injectHtmlWatermark(html) {
  const marker = `<!-- ${WATERMARK.brand} | instagram:${WATERMARK.instagram} | Educational Use Only -->`;
  const footer = `<div id="zygor-scarper-watermark" style="position:fixed;bottom:0;right:0;background:rgba(0,0,0,0.75);color:#fff;font:10px/1.4 monospace;padding:4px 8px;z-index:2147483647;pointer-events:none;opacity:0.7">${WATERMARK.brand} | instagram:${WATERMARK.instagram}</div>`;
  if (html.includes('</body>')) {
    return html.replace('</body>', `${footer}\n${marker}\n</body>`);
  }
  if (html.includes('</html>')) {
    return html.replace('</html>', `${footer}\n${marker}\n</html>`);
  }
  return html + `\n${footer}\n${marker}`;
}

export function injectCssWatermark(css) {
  return `${css}\n/* ${WATERMARK.brand} | instagram:${WATERMARK.instagram} */\n`;
}

export function injectJsWatermark(js) {
  return `/* ${WATERMARK.brand} | instagram:${WATERMARK.instagram} */\n${js}`;
}

export function brandBanner() {
  return [
    '',
    '='.repeat(64),
    `  ${WATERMARK.brand} v${WATERMARK.version}`,
    `  instagram:${WATERMARK.instagram}`,
    `  ${WATERMARK.tagline}`,
    '='.repeat(64),
    ''
  ].join('\n');
}

export default { WATERMARK, DISCLAIMER, injectHtmlWatermark, injectCssWatermark, injectJsWatermark, brandBanner };
