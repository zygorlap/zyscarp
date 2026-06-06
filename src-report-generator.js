import fs from 'fs';
import path from 'path';
import { WATERMARK } from './src-watermark.js';

export function generateReport(results, outputDir) {
  const report = {
    brand: WATERMARK.brand, instagram: WATERMARK.instagram, version: WATERMARK.version,
    generated: new Date().toISOString(), duration: results.duration,
    mirror: results.mirror?.stats || {}, crawl: results.crawl?.stats || {},
    apis: results.apis?.stats || {},
    secrets: results.secrets ? { total: results.secrets.totalSecrets, critical: results.secrets.bySeverity?.CRITICAL || 0, high: results.secrets.bySeverity?.HIGH || 0 } : null,
    tech: results.tech || {}, intel: results.intel || {},
    screenshots: results.screenshots?.length || 0, zip: results.zip?.size || 0,
    errors: results.errorLog?.total_errors || 0
  };

  fs.writeFileSync(path.join(outputDir, 'report.json'), JSON.stringify(report, null, 2));

  const tech = results.tech?.stack || [];
  const sec = results.intel?.security || {};
  const apis = results.apis?.apis?.slice(0, 30) || [];
  const secrets = results.secrets?.secrets?.slice(0, 20) || [];

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${WATERMARK.brand} Intelligence Report</title>
<link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;600&family=Outfit:wght@400;600;800&display=swap" rel="stylesheet">
<style>
:root{--bg:#030308;--card:#0c0c14;--border:rgba(255,255,255,.07);--accent:#ff2d6a;--accent2:#7c3aed;--text:#eee;--muted:#666;--green:#22c55e;--yellow:#eab308;--red:#ef4444}
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:'Outfit',sans-serif;background:var(--bg);color:var(--text);line-height:1.5}
.wrap{max-width:1000px;margin:0 auto;padding:2rem}
h1{font-size:2rem;font-weight:800;background:linear-gradient(135deg,#fff,var(--accent));-webkit-background-clip:text;-webkit-text-fill-color:transparent;margin-bottom:.25rem}
.sub{color:var(--muted);font-size:.85rem;margin-bottom:2rem}
.warn{background:rgba(239,68,68,.1);border:1px solid rgba(239,68,68,.3);border-radius:12px;padding:1rem;margin-bottom:2rem;font-size:.8rem;color:#fca5a5}
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:1rem;margin-bottom:2rem}
.card{background:var(--card);border:1px solid var(--border);border-radius:16px;padding:1.25rem}
.card h3{font-size:.65rem;text-transform:uppercase;letter-spacing:.14em;color:var(--muted);margin-bottom:.75rem}
.val{font-size:2.2rem;font-weight:800;font-family:'JetBrains Mono',monospace}
.val.sm{font-size:1rem;margin-top:.25rem;color:var(--muted)}
.section{margin:2rem 0}
.section h2{font-size:.75rem;text-transform:uppercase;letter-spacing:.15em;color:var(--accent);margin-bottom:1rem;padding-bottom:.5rem;border-bottom:1px solid var(--border)}
.chips{display:flex;flex-wrap:wrap;gap:.5rem}
.chip{background:var(--card);border:1px solid var(--border);padding:.35rem .9rem;border-radius:99px;font-size:.8rem}
table{width:100%;border-collapse:collapse;font-size:.8rem}
th,td{padding:.6rem;text-align:left;border-bottom:1px solid var(--border)}
th{color:var(--muted);font-size:.65rem;text-transform:uppercase}
.badge{padding:.15rem .5rem;border-radius:4px;font-size:.7rem;font-weight:600}
.badge.critical{background:rgba(239,68,68,.2);color:var(--red)}
.badge.high{background:rgba(234,179,8,.2);color:var(--yellow)}
.badge.ok{background:rgba(34,197,94,.2);color:var(--green)}
.sec-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:.75rem}
.sec-item{background:var(--card);border:1px solid var(--border);border-radius:10px;padding:.75rem;font-size:.8rem}
.sec-item .k{color:var(--muted);font-size:.65rem;text-transform:uppercase}
.footer{margin-top:3rem;padding-top:1.5rem;border-top:1px solid var(--border);font-size:.75rem;color:var(--muted);text-align:center}
.footer a{color:var(--accent)}
</style>
</head>
<body>
<div class="wrap">
<h1>${WATERMARK.brand}</h1>
<p class="sub">Intelligence Report · instagram:${WATERMARK.instagram} · ${report.generated} · ${report.duration}s</p>
<div class="warn"><strong>Legal:</strong> Educational & authorized use only. Unauthorized mirroring may violate laws. See DISCLAIMER.txt.</div>
<div class="grid">
  <div class="card"><h3>Website Mirror</h3><div class="val">${report.mirror.pages||0}</div><div class="val sm">${report.mirror.assets||0} assets · ${fmt(report.mirror.bytes)}</div></div>
  <div class="card"><h3>API Discovery</h3><div class="val">${report.apis.total_endpoints||0}</div><div class="val sm">${report.apis.responding_apis||0} live endpoints</div></div>
  <div class="card"><h3>Security</h3><div class="val">${report.secrets?.total||0}</div><div class="val sm">${report.secrets?.critical||0} critical · ${report.secrets?.high||0} high</div></div>
  <div class="card"><h3>Capture</h3><div class="val">${report.screenshots}</div><div class="val sm">screenshots · ${report.zip?fmt(report.zip)+' zip':'no zip'}</div></div>
</div>
${tech.length?`<div class="section"><h2>Technology Stack</h2><div class="chips">${tech.map(t=>`<span class="chip">${t.icon} ${t.name}</span>`).join('')}</div>${results.tech?.cms?`<p style="margin-top:1rem;font-size:.85rem;color:var(--muted)">CMS: <strong style="color:var(--text)">${results.tech.cms}</strong> · Framework: <strong style="color:var(--text)">${results.tech.framework||'—'}</strong> · Server: <strong style="color:var(--text)">${results.tech.server||'—'}</strong></p>`:''}</div>`:''}
<div class="section"><h2>Security Headers</h2><div class="sec-grid">
  <div class="sec-item"><div class="k">HTTPS</div><span class="badge ${sec.https?'ok':'critical'}">${sec.https?'Yes':'No'}</span></div>
  <div class="sec-item"><div class="k">HSTS</div><span class="badge ${sec.hsts?'ok':'critical'}">${sec.hsts?'Yes':'No'}</span></div>
  <div class="sec-item"><div class="k">CSP</div><span class="badge ${sec.csp?'ok':'high'}">${sec.csp?'Yes':'No'}</span></div>
  <div class="sec-item"><div class="k">X-Frame</div>${sec.xframe||'—'}</div>
</div></div>
${apis.length?`<div class="section"><h2>Live API Endpoints</h2><table><thead><tr><th>Endpoint</th><th>Status</th><th>Type</th></tr></thead><tbody>${apis.map(a=>`<tr><td>${esc(a.endpoint)}</td><td><span class="badge ok">${a.status}</span></td><td>${esc(a.contentType||'—')}</td></tr>`).join('')}</tbody></table></div>`:''}
${secrets.length?`<div class="section"><h2>Security Findings</h2><table><thead><tr><th>Type</th><th>Severity</th><th>Source</th></tr></thead><tbody>${secrets.map(s=>`<tr><td>${esc(s.name)}</td><td><span class="badge ${s.severity==='CRITICAL'?'critical':s.severity==='HIGH'?'high':'ok'}">${s.severity}</span></td><td style="font-size:.7rem">${esc(s.source||'').slice(0,60)}</td></tr>`).join('')}</tbody></table></div>`:''}
<div class="footer">${WATERMARK.brand} v${WATERMARK.version} · Free Open Source · <a href="index.html">← Mirror Index</a> · <a href="https://instagram.com/zygorlap">instagram:@zygorlap</a></div>
</div>
</body>
</html>`;

  fs.writeFileSync(path.join(outputDir, 'report.html'), html);
  return report;
}

function fmt(b){if(!b)return'0 B';if(b<1024)return b+' B';if(b<1048576)return(b/1024).toFixed(1)+' KB';return(b/1048576).toFixed(2)+' MB'}
function esc(s){return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')}

export default { generateReport };
