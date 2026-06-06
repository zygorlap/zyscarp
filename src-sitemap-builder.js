import fs from 'fs';
import path from 'path';
import { WATERMARK } from './src-watermark.js';

export function buildSitemap(manifest, outputDir) {
  const entries = (manifest.files || []).filter(f => {
    const ext = path.extname(f.local).toLowerCase();
    return ['.html', '.htm', '.php', '.asp', '.aspx'].includes(ext) || !ext;
  });

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${entries.map(e => `  <url><loc>${escXml(e.url)}</loc><lastmod>${manifest.timestamp}</lastmod></url>`).join('\n')}
</urlset>`;

  fs.writeFileSync(path.join(outputDir, 'sitemap.xml'), xml);
}

export function buildOfflineIndex(manifest, outputDir, results = {}) {
  const files = manifest.files || [];
  const byType = {};
  for (const f of files) {
    const ext = path.extname(f.local).toLowerCase() || '.html';
    byType[ext] = (byType[ext] || 0) + 1;
  }

  const tech = results.tech?.stack || [];
  const shots = results.screenshots || [];
  const intel = results.intel || {};

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${WATERMARK.brand} — ${manifest.hostname}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;600&family=Outfit:wght@300;500;700;800&display=swap" rel="stylesheet">
<style>
:root{--bg:#030308;--surface:#0c0c14;--border:rgba(255,255,255,.07);--accent:#ff2d6a;--accent2:#7c3aed;--text:#eeeef4;--muted:#5c5c72}
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:'Outfit',sans-serif;background:var(--bg);color:var(--text);min-height:100vh}
.aurora{position:fixed;inset:0;background:radial-gradient(ellipse 70% 50% at 20% -10%,rgba(124,58,237,.3),transparent),radial-gradient(ellipse 50% 40% at 90% 80%,rgba(255,45,106,.2),transparent);pointer-events:none;z-index:0}
.shell{position:relative;z-index:1;max-width:1200px;margin:0 auto;padding:2rem}
.hero{padding:3rem 0 2rem;text-align:center}
.hero h1{font-size:clamp(2rem,5vw,3.2rem);font-weight:800;background:linear-gradient(135deg,#fff 30%,var(--accent));-webkit-background-clip:text;-webkit-text-fill-color:transparent}
.hero .host{color:var(--muted);margin-top:.5rem;font-size:1rem}
.hero .brand{margin-top:1rem;font-size:.8rem;color:var(--accent)}
.stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:1rem;margin:2rem 0}
.stat{background:var(--surface);border:1px solid var(--border);border-radius:20px;padding:1.4rem;text-align:center;backdrop-filter:blur(20px);transition:transform .25s,box-shadow .25s}
.stat:hover{transform:translateY(-4px);box-shadow:0 12px 40px rgba(255,45,106,.2)}
.stat .n{font-size:2rem;font-weight:800;font-family:'JetBrains Mono',monospace;background:linear-gradient(135deg,var(--accent2),var(--accent));-webkit-background-clip:text;-webkit-text-fill-color:transparent}
.stat .l{font-size:.65rem;text-transform:uppercase;letter-spacing:.14em;color:var(--muted);margin-top:.35rem}
.tech{display:flex;flex-wrap:wrap;gap:.5rem;justify-content:center;margin:1.5rem 0}
.chip{background:var(--surface);border:1px solid var(--border);padding:.4rem 1rem;border-radius:99px;font-size:.8rem;display:flex;align-items:center;gap:.4rem}
.chip .ico{opacity:.7}
.warn{background:rgba(255,45,106,.08);border:1px solid rgba(255,45,106,.3);border-radius:12px;padding:1rem;margin:1.5rem 0;font-size:.8rem;color:#ff8fa8;line-height:1.5}
.toolbar{display:flex;gap:.75rem;flex-wrap:wrap;margin:1.5rem 0}
.toolbar input,.toolbar select{flex:1;min-width:200px;background:var(--surface);border:1px solid var(--border);border-radius:12px;padding:.75rem 1rem;color:var(--text);font-family:inherit;font-size:.9rem}
.toolbar input:focus{outline:none;border-color:var(--accent)}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:1rem;margin:1.5rem 0}
.card{background:var(--surface);border:1px solid var(--border);border-radius:16px;padding:1rem;transition:all .2s}
.card:hover{border-color:var(--accent);transform:scale(1.01)}
.card a{color:var(--text);text-decoration:none}
.card .path{font-family:'JetBrains Mono',monospace;font-size:.72rem;color:var(--muted);word-break:break-all;margin-top:.4rem}
.card .size{font-size:.7rem;color:var(--accent);margin-top:.3rem}
.shots{display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:1rem;margin:2rem 0}
.shots img{width:100%;border-radius:12px;border:1px solid var(--border);aspect-ratio:16/10;object-fit:cover;object-position:top}
.shots figcaption{font-size:.7rem;color:var(--muted);margin-top:.4rem;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.footer{text-align:center;padding:3rem 0 2rem;font-size:.75rem;color:var(--muted)}
.footer a{color:var(--accent);text-decoration:none}
table{width:100%;border-collapse:collapse;margin-top:1rem}
th,td{padding:.6rem;text-align:left;border-bottom:1px solid var(--border);font-size:.8rem}
th{color:var(--accent);font-size:.7rem;text-transform:uppercase;letter-spacing:.1em}
td a{color:#7cb8ff;text-decoration:none}
.view-toggle{display:flex;gap:.5rem;margin-bottom:1rem}
.view-toggle button{background:var(--surface);border:1px solid var(--border);color:var(--text);padding:.5rem 1rem;border-radius:8px;cursor:pointer;font-family:inherit}
.view-toggle button.active{background:var(--accent);border-color:var(--accent);color:#fff}
#tableView{display:none}
</style>
</head>
<body>
<div class="aurora"></div>
<div class="shell">
  <div class="hero">
    <h1>${WATERMARK.brand}</h1>
    <p class="host">Offline Mirror — ${esc(manifest.hostname)}</p>
    <p class="brand">instagram:${WATERMARK.instagram} · v${WATERMARK.version} · ${manifest.timestamp}</p>
  </div>
  <div class="warn"><strong>Disclaimer:</strong> Educational & authorized use only. @zygorlap is not liable for misuse. See DISCLAIMER.txt.</div>
  <div class="stats">
    <div class="stat"><div class="n">${manifest.stats?.pages||0}</div><div class="l">Pages</div></div>
    <div class="stat"><div class="n">${manifest.stats?.assets||0}</div><div class="l">Assets</div></div>
    <div class="stat"><div class="n">${fmt(manifest.stats?.bytes||0)}</div><div class="l">Total Size</div></div>
    <div class="stat"><div class="n">${manifest.stats?.networkHits||0}</div><div class="l">Network Hits</div></div>
    <div class="stat"><div class="n">${manifest.stats?.errors||0}</div><div class="l">Errors</div></div>
    <div class="stat"><div class="n">${intel.performance?.ttfb||'—'}${intel.performance?.ttfb?'ms':''}</div><div class="l">TTFB</div></div>
  </div>
  ${tech.length?`<div class="tech">${tech.map(t=>`<span class="chip"><span class="ico">${t.icon}</span>${esc(t.name)}</span>`).join('')}</div>`:''}
  ${shots.length?`<h3 style="margin:2rem 0 .5rem;font-size:.8rem;text-transform:uppercase;letter-spacing:.12em;color:var(--muted)">Screenshots</h3><div class="shots">${shots.map(s=>`<figure><a href="${s.path}"><img src="${s.path}" alt="" loading="lazy"></a><figcaption>${esc(s.url)}</figcaption></figure>`).join('')}</div>`:''}
  <div class="toolbar">
    <input type="search" id="search" placeholder="Search files & URLs...">
    <select id="filter"><option value="">All types</option>${Object.keys(byType).map(e=>`<option value="${e}">${e} (${byType[e]})</option>`).join('')}</select>
  </div>
  <div class="view-toggle">
    <button class="active" onclick="setView('grid')">Grid</button>
    <button onclick="setView('table')">Table</button>
    <a href="report.html" style="margin-left:auto;background:linear-gradient(135deg,var(--accent2),var(--accent));color:#fff;padding:.5rem 1.2rem;border-radius:8px;text-decoration:none;font-size:.85rem">Full Report →</a>
  </div>
  <div class="grid" id="gridView">${files.map(f=>`<div class="card" data-ext="${path.extname(f.local)}" data-q="${esc(f.url+' '+f.local).toLowerCase()}"><a href="${f.local}"><strong>${esc(path.basename(f.local))}</strong><div class="path">${esc(f.local)}</div><div class="size">${fmt(f.size)}</div></a></div>`).join('')}</div>
  <div id="tableView"><table><thead><tr><th>File</th><th>URL</th><th>Size</th></tr></thead><tbody>${files.map(f=>`<tr data-ext="${path.extname(f.local)}" data-q="${esc(f.url+' '+f.local).toLowerCase()}"><td><a href="${f.local}">${esc(f.local)}</a></td><td>${esc(f.url)}</td><td>${fmt(f.size)}</td></tr>`).join('')}</tbody></table></div>
  <div class="footer">${WATERMARK.brand} v${WATERMARK.version} · Free Open Source · <a href="https://instagram.com/zygorlap">instagram:@zygorlap</a></div>
</div>
<script>
const search=document.getElementById('search'),filter=document.getElementById('filter');
function filterAll(){
  const q=search.value.toLowerCase(),ext=filter.value;
  document.querySelectorAll('[data-q]').forEach(el=>{
    const match=(!q||el.dataset.q.includes(q))&&(!ext||el.dataset.ext===ext);
    el.style.display=match?'':'none';
  });
}
search.oninput=filterAll;filter.onchange=filterAll;
function setView(v){
  document.getElementById('gridView').style.display=v==='grid'?'grid':'none';
  document.getElementById('tableView').style.display=v==='table'?'block':'none';
  document.querySelectorAll('.view-toggle button').forEach((b,i)=>b.classList.toggle('active',(v==='grid'&&i===0)||(v==='table'&&i===1)));
}
</script>
</body>
</html>`;

  fs.writeFileSync(path.join(outputDir, 'index.html'), html);
}

function fmt(b){if(b<1024)return b+' B';if(b<1048576)return(b/1024).toFixed(1)+' KB';return(b/1048576).toFixed(2)+' MB'}
function esc(s){return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;')}
function escXml(s){return esc(s)}

export default { buildSitemap, buildOfflineIndex };
