export class MetricsCollector {
  constructor() {
    this.metrics = {
      startTime: Date.now(),
      endTime: null,
      duration: 0,
      
      pages: {
        total: 0,
        success: 0,
        failed: 0,
        cached: 0,
        avgSize: 0,
        avgLoadTime: 0
      },
      
      assets: {
        total: 0,
        success: 0,
        failed: 0,
        cached: 0,
        byType: {},
        totalSize: 0,
        avgSize: 0,
        avgLoadTime: 0
      },
      
      network: {
        totalRequests: 0,
        totalBytes: 0,
        fastHits: 0,
        browserHits: 0,
        networkHits: 0,
        avgResponseTime: 0,
        bandwidth: 0
      },
      
      errors: {
        total: 0,
        byType: {},
        byUrl: {}
      },
      
      performance: {
        cpuUsage: 0,
        memoryUsage: 0,
        peakMemory: 0,
        threadsActive: 0,
        activeConnections: 0
      },
      
      timestamps: []
    };

    this.requests = [];
    this.errors = [];
  }

  recordPageFetch(url, size, loadTime, success = true, cached = false) {
    this.metrics.pages.total++;
    if (success) {
      this.metrics.pages.success++;
      this.metrics.pages.avgSize = (this.metrics.pages.avgSize * (this.metrics.pages.success - 1) + size) / this.metrics.pages.success;
      this.metrics.pages.avgLoadTime = (this.metrics.pages.avgLoadTime * (this.metrics.pages.success - 1) + loadTime) / this.metrics.pages.success;
    } else {
      this.metrics.pages.failed++;
    }
    if (cached) this.metrics.pages.cached++;

    this.recordRequest({ type: 'page', url, size, loadTime, success, cached });
  }

  recordAssetFetch(url, contentType, size, loadTime, success = true, cached = false) {
    this.metrics.assets.total++;
    this.metrics.assets.totalSize += size;
    
    if (success) {
      this.metrics.assets.success++;
      this.metrics.assets.avgSize = this.metrics.assets.totalSize / this.metrics.assets.success;
      this.metrics.assets.avgLoadTime = (this.metrics.assets.avgLoadTime * (this.metrics.assets.success - 1) + loadTime) / this.metrics.assets.success;
    } else {
      this.metrics.assets.failed++;
    }
    if (cached) this.metrics.assets.cached++;

    // Track by type
    const ext = contentType.split('/')[1] || 'unknown';
    if (!this.metrics.assets.byType[ext]) {
      this.metrics.assets.byType[ext] = { count: 0, size: 0 };
    }
    this.metrics.assets.byType[ext].count++;
    this.metrics.assets.byType[ext].size += size;

    this.recordRequest({ type: 'asset', url, contentType, size, loadTime, success, cached });
  }

  recordRequest(req) {
    this.requests.push({
      timestamp: Date.now(),
      ...req
    });
    
    this.metrics.network.totalRequests++;
    this.metrics.network.totalBytes += req.size || 0;
    this.metrics.network.avgResponseTime = this.metrics.network.totalBytes / this.metrics.network.totalRequests;
  }

  recordError(url, error, errorType = 'unknown') {
    this.metrics.errors.total++;
    
    if (!this.metrics.errors.byType[errorType]) {
      this.metrics.errors.byType[errorType] = 0;
    }
    this.metrics.errors.byType[errorType]++;

    if (!this.metrics.errors.byUrl[url]) {
      this.metrics.errors.byUrl[url] = [];
    }
    this.metrics.errors.byUrl[url].push({
      timestamp: Date.now(),
      error,
      errorType
    });

    this.errors.push({ url, error, errorType, timestamp: Date.now() });
  }

  recordNetworkHit() {
    this.metrics.network.networkHits++;
  }

  recordFastHit() {
    this.metrics.network.fastHits++;
  }

  recordBrowserHit() {
    this.metrics.network.browserHits++;
  }

  updatePerformance() {
    if (process.memoryUsage) {
      const mem = process.memoryUsage();
      this.metrics.performance.memoryUsage = Math.round(mem.heapUsed / 1024 / 1024); // MB
      this.metrics.performance.peakMemory = Math.max(
        this.metrics.performance.peakMemory,
        this.metrics.performance.memoryUsage
      );
    }

    if (process.cpuUsage) {
      const cpu = process.cpuUsage();
      this.metrics.performance.cpuUsage = cpu.user;
    }
  }

  finalize() {
    this.metrics.endTime = Date.now();
    this.metrics.duration = this.metrics.endTime - this.metrics.startTime;

    // Calculate bandwidth (bytes per second)
    const seconds = this.metrics.duration / 1000;
    this.metrics.network.bandwidth = Math.round(this.metrics.network.totalBytes / seconds);

    this.updatePerformance();
  }

  getMetrics() {
    return { ...this.metrics };
  }

  getSummary() {
    return {
      duration: `${Math.round(this.metrics.duration / 1000)}s`,
      pages: `${this.metrics.pages.success}/${this.metrics.pages.total}`,
      assets: `${this.metrics.assets.success}/${this.metrics.assets.total}`,
      totalSize: this.formatBytes(this.metrics.network.totalBytes),
      bandwidth: `${this.formatBytes(this.metrics.network.bandwidth)}/s`,
      errors: this.metrics.errors.total,
      memory: `${this.metrics.performance.memoryUsage}MB`,
      cached: `${this.metrics.pages.cached + this.metrics.assets.cached} items`
    };
  }

  formatBytes(bytes) {
    const units = ['B', 'KB', 'MB', 'GB'];
    let size = bytes;
    let unitIndex = 0;
    while (size >= 1024 && unitIndex < units.length - 1) {
      size /= 1024;
      unitIndex++;
    }
    return `${size.toFixed(2)} ${units[unitIndex]}`;
  }

  toJSON() {
    return {
      metrics: this.metrics,
      requests: this.requests.slice(-1000), // Last 1000 requests
      errors: this.errors.slice(-100)       // Last 100 errors
    };
  }

  generateReport() {
    const summary = this.getSummary();
    let report = '\n' + '='.repeat(70) + '\n';
    report += '📊 PERFORMANCE REPORT\n';
    report += '='.repeat(70) + '\n\n';

    report += '⏱️  TIMING\n';
    report += `   Duration: ${summary.duration}\n`;
    report += `   Pages: ${summary.pages}\n`;
    report += `   Assets: ${summary.assets}\n\n`;

    report += '📈 DATA\n';
    report += `   Total Size: ${summary.totalSize}\n`;
    report += `   Bandwidth: ${summary.bandwidth}\n`;
    report += `   Errors: ${summary.errors}\n`;
    report += `   Cached: ${summary.cached}\n\n`;

    report += '💾 RESOURCES\n';
    report += `   Memory: ${summary.memory}\n`;
    report += `   Peak: ${this.formatBytes(this.metrics.performance.peakMemory * 1024 * 1024)}\n\n`;

    report += '🔍 BREAKDOWN\n';
    report += `   Fast HTTP: ${this.metrics.network.fastHits}\n`;
    report += `   Browser: ${this.metrics.network.browserHits}\n`;
    report += `   Network: ${this.metrics.network.networkHits}\n\n`;

    if (Object.keys(this.metrics.errors.byType).length > 0) {
      report += '⚠️  ERRORS BY TYPE\n';
      for (const [type, count] of Object.entries(this.metrics.errors.byType)) {
        report += `   ${type}: ${count}\n`;
      }
      report += '\n';
    }

    report += 'ASSET BREAKDOWN\n';
    for (const [type, data] of Object.entries(this.metrics.assets.byType)) {
      report += `   ${type}: ${data.count} files (${this.formatBytes(data.size)})\n`;
    }

    report += '='.repeat(70) + '\n';
    return report;
  }
}

export default MetricsCollector;
