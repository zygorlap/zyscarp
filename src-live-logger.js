import fs from 'fs';
import path from 'path';
import { WATERMARK } from './src-watermark.js';

export class LiveLogger {
  constructor(outputDir = './output') {
    this.outputDir = outputDir;
    this.logPath = path.join(outputDir, 'live.log');
    this.progressPath = path.join(outputDir, 'live-progress.json');
    this.htmlPath = path.join(outputDir, 'progress.html');
    this._start = Date.now();
    this._lastConsole = 0;
    this._lastGha = 0;
    this._lastFile = 0;
    this._counter = 0;
    this.state = {
      phase: 'init',
      pages: 0,
      assets: 0,
      bytes: 0,
      errors: 0,
      queue: 0,
      total: 0,
      current: 0,
      url: '',
      speed: 0,
      pagesPerMin: 0,
      eta: '',
      elapsed: 0,
      engine: 'hybrid',
      recent: []
    };
    if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });
    this._interval = setInterval(() => this.flushFiles(), 3000);
    this.banner();
  }

  banner() {
    this.out('═'.repeat(72));
    this.out(`${WATERMARK.brand} v${WATERMARK.version} LIVE ENGINE | instagram:${WATERMARK.instagram}`);
    this.out('═'.repeat(72));
  }

  out(msg, level = 'info') {
    const ts = new Date().toISOString().slice(11, 19);
    const line = `[${ts}] ${msg}`;
    process.stdout.write(line + '\n');
    try {
      fs.appendFileSync(this.logPath, line + '\n');
    } catch {}
    if (level === 'error') process.stderr.write(line + '\n');
  }

  phase(name, detail = '') {
    this.state.phase = name;
    this.out('');
    this.out(`▶ PHASE: ${name.toUpperCase()}${detail ? ' — ' + detail : ''}`);
    this.out('─'.repeat(72));
    this.ghaNotice(`Phase: ${name}`, detail || 'started');
    this.flushFiles();
  }

  progress(data = {}) {
    Object.assign(this.state, data);
    const now = Date.now();
    this.state.elapsed = Math.round((now - this._start) / 1000);
    const elapsedMin = Math.max(this.state.elapsed / 60, 0.01);
    this.state.pagesPerMin = +(this.state.pages / elapsedMin).toFixed(1);
    if (this.state.pages > 0 && this.state.total > 0) {
      const remaining = this.state.total - this.state.pages;
      const etaSec = remaining / (this.state.pages / Math.max(this.state.elapsed, 1));
      this.state.eta = this.fmtEta(etaSec);
    }
    if (data.url) {
      const short = data.url.length > 90 ? data.url.slice(0, 87) + '...' : data.url;
      this.state.recent.unshift({ url: short, t: Date.now() });
      if (this.state.recent.length > 50) this.state.recent.pop();
    }
    this._counter++;
    const shouldConsole = now - this._lastConsole > 800 || this._counter % 1 === 0;
    if (shouldConsole && this.state.phase === 'mirroring') {
      const pct = this.state.total > 0 ? Math.round((this.state.pages / this.state.total) * 100) : 0;
      const bar = this.bar(pct);
      this.out(
        `${bar} ${pct}% | PAGE ${this.state.pages}/${this.state.total} | ` +
        `ASSETS ${this.state.assets} | ${fmt(this.state.bytes)} | ` +
        `${this.state.pagesPerMin} pg/min | ETA ${this.state.eta || '?'} | ` +
        `Q:${this.state.queue} ERR:${this.state.errors}`
      );
      if (data.url) this.out(`  ↳ ${data.url.slice(0, 120)}`);
      this._lastConsole = now;
    }
    if (now - this._lastGha > 30000 && process.env.GITHUB_ACTIONS) {
      this.ghaNotice(
        `${this.state.phase} ${this.state.pages}/${this.state.total}`,
        `${this.state.assets} assets | ${fmt(this.state.bytes)} | ${this.state.pagesPerMin} pg/min | ETA ${this.state.eta || '?'}`
      );
      this._lastGha = now;
    }
    if (now - this._lastFile > 2000) {
      this.flushFiles();
      this._lastFile = now;
    }
  }

  log(msg, level = 'info') {
    this.out(msg, level);
  }

  warn(msg) { this.out(`⚠ ${msg}`, 'warn'); }
  error(msg) { this.out(`✖ ${msg}`, 'error'); }
  success(msg) { this.out(`✔ ${msg}`); }

  heartbeat() {
    this.out(
      `♥ HEARTBEAT | ${this.state.phase} | ${this.state.pages} pages | ` +
      `${this.state.assets} assets | ${fmt(this.state.bytes)} | ${this.state.elapsed}s elapsed`
    );
    this.flushFiles();
  }

  ghaNotice(title, message) {
    if (!process.env.GITHUB_ACTIONS) return;
    const t = title.replace(/[%\r\n]/g, ' ').slice(0, 100);
    const m = message.replace(/[%\r\n]/g, ' ').slice(0, 500);
    process.stdout.write(`::notice title=${t}::${m}\n`);
  }

  bar(pct, w = 24) {
    const f = Math.round((pct / 100) * w);
    return '[' + '█'.repeat(f) + '░'.repeat(w - f) + ']';
  }

  fmtEta(sec) {
    if (!sec || !isFinite(sec)) return '?';
    sec = Math.round(sec);
    if (sec < 60) return `${sec}s`;
    if (sec < 3600) return `${Math.floor(sec / 60)}m ${sec % 60}s`;
    return `${Math.floor(sec / 3600)}h ${Math.floor((sec % 3600) / 60)}m`;
  }

  flushFiles() {
    try {
      const snap = { ...this.state, updated: new Date().toISOString(), instagram: WATERMARK.instagram };
      fs.writeFileSync(this.progressPath, JSON.stringify(snap, null, 2));
      fs.writeFileSync(this.htmlPath, this.buildHtml(snap));
    } catch {}
  }

  buildHtml(s) {
    const recent = (s.recent || []).slice(0, 20).map(r =>
      `<div class="row">${r.url}</div>`
    ).join('');
    return `<!DOCTYPE html><html><head><meta charset="UTF-8"><meta http-equiv="refresh" content="3">
<title>${WATERMARK.brand} Live</title>
<style>
body{font-family:monospace;background:#050508;color:#eee;padding:1.5rem}
h1{color:#ff2d6a;font-size:1.2rem}.bar{background:#222;border-radius:4px;height:20px;margin:1rem 0}
.fill{background:linear-gradient(90deg,#7c3aed,#ff2d6a);height:100%;border-radius:4px;width:${s.total?s.pages/s.total*100:0}%}
.grid{display:grid;grid-template-columns:repeat(4,1fr);gap:1rem;margin:1rem 0}
.card{background:#111;padding:1rem;border-radius:8px}.n{font-size:1.5rem;color:#ff2d6a}
.l{font-size:.7rem;color:#888}.row{font-size:.75rem;padding:.2rem 0;border-bottom:1px solid #222}
</style></head><body>
<h1>${WATERMARK.brand} LIVE | instagram:${WATERMARK.instagram}</h1>
<p>Phase: <b>${s.phase}</b> | Engine: ${s.engine} | Updated: ${s.updated}</p>
<div class="bar"><div class="fill"></div></div>
<div class="grid">
<div class="card"><div class="n">${s.pages}</div><div class="l">PAGES / ${s.total}</div></div>
<div class="card"><div class="n">${s.assets}</div><div class="l">ASSETS</div></div>
<div class="card"><div class="n">${fmt(s.bytes)}</div><div class="l">DOWNLOADED</div></div>
<div class="card"><div class="n">${s.pagesPerMin}</div><div class="l">PG/MIN | ETA ${s.eta||'?'}</div></div>
</div>
<p>Queue: ${s.queue} | Errors: ${s.errors} | Elapsed: ${s.elapsed}s</p>
<h3>Recent</h3>${recent}
</body></html>`;
  }

  close() {
    clearInterval(this._interval);
    this.flushFiles();
    this.success(`LOG SAVED → live.log | live-progress.json | progress.html`);
  }
}

function fmt(b) {
  if (!b) return '0 B';
  if (b < 1024) return b + ' B';
  if (b < 1048576) return (b / 1024).toFixed(1) + ' KB';
  return (b / 1048576).toFixed(2) + ' MB';
}

export default LiveLogger;
