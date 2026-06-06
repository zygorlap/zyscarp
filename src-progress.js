import { EventEmitter } from 'events';

export class ProgressTracker extends EventEmitter {
  constructor() {
    super();
    this.state = {
      phase: 'idle',
      current: 0,
      total: 0,
      url: '',
      pages: 0,
      assets: 0,
      bytes: 0,
      errors: 0,
      speed: 0,
      elapsed: 0,
      log: []
    };
    this._start = Date.now();
    this._lastBytes = 0;
    this._lastTick = Date.now();
  }

  setPhase(phase, total = 0) {
    this.state.phase = phase;
    this.state.total = total;
    this.state.current = 0;
    this.emit('update', this.snapshot());
  }

  tick(data = {}) {
    Object.assign(this.state, data);
    const now = Date.now();
    const dt = (now - this._lastTick) / 1000;
    if (dt >= 1) {
      this.state.speed = Math.round((this.state.bytes - this._lastBytes) / dt);
      this._lastBytes = this.state.bytes;
      this._lastTick = now;
    }
    this.state.elapsed = Math.round((now - this._start) / 1000);
    this.emit('update', this.snapshot());
  }

  log(msg, level = 'info') {
    const entry = { t: new Date().toISOString(), level, msg };
    this.state.log.unshift(entry);
    if (this.state.log.length > 200) this.state.log.pop();
    this.emit('log', entry);
    this.emit('update', this.snapshot());
  }

  snapshot() {
    return { ...this.state, log: [...this.state.log] };
  }
}

export default ProgressTracker;
