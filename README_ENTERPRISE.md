# 🔥 Zygor Scarper - Enterprise Edition v3.2.0

## The $2000+ Web Scraping & Mirroring Suite

**Transform websites into offline mirrors, extract APIs, analyze content, and generate comprehensive intelligence reports** — with enterprise-grade performance, reliability, and features.

---

## ✨ What's New in v3.2.0 (Enterprise Edition)

### 🎯 Major Features
- ✅ **Configuration System** - `.zygorrc` files with presets
- ✅ **Advanced CLI** - Professional command-line interface
- ✅ **Metrics & Analytics** - Real-time performance tracking
- ✅ **Better Error Handling** - Enterprise error recovery
- ✅ **Web Dashboard** - Live monitoring interface (http://localhost:3000)
- ✅ **Plugin System** - Extensible architecture
- ✅ **Multi-format Export** - JSON, CSV, XML support
- ✅ **Structured Logging** - Winston-based logging system

---

## 🚀 Quick Start

### Installation
```bash
npm install
```

### Basic Usage
```bash
# Using CLI
npm run cli -- --target https://example.com --preset gentle

# With custom config
npm run cli -- --target https://example.com --preset aggressive

# Show help
npm run cli help

# List presets
npm run cli presets
```

### Configuration File
Create `.zygorrc.json` in your project:
```json
{
  "target": "https://example.com",
  "mode": "fast",
  "preset": "gentle",
  "maxPages": 500,
  "concurrent": 16,
  "logLevel": "info"
}
```

Then run:
```bash
npm start
```

---

## 🎨 Presets

Choose from 4 optimized presets:

### `stealth` 
For sites with strict anti-scraping:
- Slow, respectful crawling
- User-agent rotation
- Respects robots.txt
- Rate limit: 2000ms

### `gentle`
Balanced approach (recommended):
- Moderate speed
- User-agent rotation
- Screenshots enabled
- Rate limit: 1500ms

### `aggressive`
Maximum speed:
- Fast concurrent requests
- No delays
- High bandwidth
- For owned/authorized sites

### `performance`
Optimized for large sites:
- Maximum concurrency (48 threads)
- Caching enabled
- Compression enabled
- Delta sync enabled

---

## 🛠️ Configuration Options

### Core Settings
```json
{
  "target": "https://example.com",      // Required: Target URL
  "mode": "fast",                        // light|fast|complete|aggressive|nuclear
  "preset": "gentle",                    // stealth|gentle|aggressive|performance
  "maxPages": 500,                       // Max pages to crawl
  "concurrent": 16,                      // Concurrent connections
  "outputDir": "./output"                // Output directory
}
```

### Timing & Rate Limiting
```json
{
  "delay": 200,                          // Delay between requests (ms)
  "timeout": 20000,                      // Request timeout (ms)
  "rateLimit": 1000                      // Rate limit (ms between requests)
}
```

### Features
```json
{
  "enableDownload": true,                // Download assets
  "enableCrawl": true,                   // Crawl pages
  "enableApiScraping": true,             // Extract APIs
  "enableSecretExtraction": false,       // Extract secrets (dangerous)
  "enableErrorBypass": true,             // Try to bypass error pages
  "enableScreenshots": true,             // Capture screenshots
  "enableZip": true,                     // Create ZIP archive
  "enableIntel": true,                   // Gather site intelligence
  "enableMetrics": true                  // Collect metrics
}
```

### Advanced Options
```json
{
  "respectRobotsTxt": true,              // Respect robots.txt
  "userAgentRotation": true,             // Rotate user agents
  "proxy": null,                         // Proxy URL (optional)
  "retries": 5,                          // Retry attempts
  "caching": false,                      // Enable caching
  "deltaSync": false,                    // Only download changed files
  "compression": false                   // Enable compression
}
```

### Logging & Export
```json
{
  "logLevel": "info",                    // trace|debug|info|warn|error|fatal
  "logFile": null,                       // Log file path (optional)
  "logFormat": "json",                   // json|text
  "exportFormats": ["json"],             // Export formats
  "webhookUrl": null                     // Webhook for notifications
}
```

---

## 📊 Web Dashboard

Start the dashboard server:
```bash
# The dashboard starts automatically if enableMetrics is true
# Access at: http://localhost:3000
```

### Dashboard Features
- 📈 Real-time metrics
- 📊 Performance graphs
- 📋 Activity logs
- 🎯 Progress tracking
- ⚠️ Error monitoring
- 💾 Resource usage

---

## 🔌 Plugin System

Extend functionality with plugins:

```javascript
import { PluginManager, CachePlugin, ErrorRecoveryPlugin } from './src-plugin-system.js';

const pluginManager = new PluginManager();
pluginManager.register('cache', CachePlugin);
pluginManager.register('errors', ErrorRecoveryPlugin);

// Execute hooks
await pluginManager.executeHook('before-crawl', { url: '...' });
```

### Built-in Plugins
- **MetricsPlugin** - Track performance
- **CachePlugin** - Cache responses
- **ErrorRecoveryPlugin** - Intelligent retry logic
- **FilterPlugin** - URL filtering
- **NotificationPlugin** - Webhook notifications
- **ExportPlugin** - Multi-format export

---

## 📈 Metrics & Analytics

Access detailed metrics:

```javascript
import MetricsCollector from './src-metrics-collector.js';

const metrics = new MetricsCollector();
metrics.recordPageFetch(url, size, loadTime, success);
metrics.finalize();

console.log(metrics.getSummary());
console.log(metrics.generateReport());
```

### Metrics Tracked
- Pages downloaded/failed
- Assets by type
- Total bandwidth
- Memory usage
- CPU utilization
- Error rates
- Response times
- Cache hit rates

---

## 🛡️ Error Handling

Enterprise-grade error handling:

```javascript
import { ErrorHandler, NetworkError, TimeoutError } from './src-error-handler.js';

const errorHandler = new ErrorHandler();

try {
  // ... scraping code
} catch (error) {
  const zygorError = errorHandler.handle(error, { url });
  
  if (errorHandler.shouldRetry(zygorError, retryCount)) {
    const delay = errorHandler.getRetryDelay(zygorError, retryCount);
    // Retry after delay
  }
}
```

### Error Types
- `NetworkError` - Connection/HTTP issues
- `TimeoutError` - Request timeouts
- `ParseError` - HTML/JSON parsing failures
- `ValidationError` - Invalid configurations
- `ResourceError` - Memory/disk issues
- `RateLimitError` - Rate limiting
- `AuthenticationError` - Auth failures

---

## 🎯 CLI Commands

```bash
# Help
zygor help

# Show version
zygor version

# List presets
zygor presets

# Show current configuration
zygor config

# Create config template
zygor create-config

# Start scraping (from config file)
zygor

# Start with options
zygor --target https://example.com --preset aggressive --log-level debug
```

### CLI Options
```
--target <url>              Target website URL
--mode <mode>              light|fast|complete|aggressive|nuclear
--preset <name>            stealth|gentle|aggressive|performance
--max-pages <n>            Maximum pages to crawl
--concurrent <n>           Concurrent connections
--output <dir>             Output directory
--log-level <level>        trace|debug|info|warn|error|fatal
--timeout <ms>             Request timeout
--delay <ms>               Delay between requests
--proxy <url>              Proxy URL
--retries <n>              Number of retries
--no-download              Skip asset download
--no-crawl                 Skip page crawl
--no-screenshots           Skip screenshots
--enable-cache             Enable caching
--enable-delta-sync        Enable differential sync
```

---

## 📁 Output Structure

```
output/
├── mirror/
│   └── example.com/
│       ├── index.html
│       ├── about/
│       │   └── index.html
│       ├── assets/
│       │   ├── styles.css
│       │   ├── script.js
│       │   └── images/
│       └── ...
├── mirror-manifest.json
├── site-intel.json
├── report.html
├── metrics.json
└── mirror.zip
```

---

## 🔐 Environment Variables

```bash
ZYGOR_TARGET=https://example.com
ZYGOR_MODE=fast
ZYGOR_PRESET=gentle
ZYGOR_MAX_PAGES=500
ZYGOR_CONCURRENT=16
ZYGOR_LOG_LEVEL=info
ZYGOR_OUTPUT=./output
ZYGOR_PROXY=http://proxy.example.com:8080
ZYGOR_TIMEOUT=20000
ZYGOR_DELAY=200
```

---

## 🚀 Performance Tips

1. **Use Presets** - Choose the right preset for your use case
2. **Set Rate Limits** - Respect target server resources
3. **Enable Caching** - Reuse downloaded content
4. **Use Delta Sync** - Only download changed files
5. **Compress Assets** - Enable compression for large sites
6. **Optimize Concurrency** - Find balance between speed and stability
7. **Monitor Metrics** - Use dashboard to identify bottlenecks

---

## 📊 Competitive Features vs Alternatives

| Feature | Zygor Standard | Zygor Enterprise | $2000 Tools |
|---------|---|---|---|
| URL Extraction | ✅ | ✅ | ✅ |
| Asset Downloads | ✅ | ✅ | ✅ |
| JavaScript Rendering | ✅ | ✅ | ✅ |
| Configuration Files | ❌ | ✅ | ✅ |
| Presets | ❌ | ✅ | ✅ |
| CLI Interface | Basic | Advanced | ✅ |
| Web Dashboard | ❌ | ✅ | ✅ |
| Metrics & Analytics | Basic | Advanced | ✅ |
| Error Recovery | Basic | Advanced | ✅ |
| Plugin System | ❌ | ✅ | ✅ |
| Scheduling | ❌ | Planned | ✅ |
| Multi-format Export | ❌ | Planned | ✅ |
| Caching | ❌ | Planned | ✅ |
| Proxies | Basic | Planned | ✅ |
| Rate Limiting | Basic | ✅ | ✅ |
| Cost | Free | Free | $2000+ |

---

## 🗺️ Roadmap

### Phase 2 (Next)
- Session persistence
- Advanced caching system
- Job scheduling (cron)
- Database connectors

### Phase 3
- Cloud storage integration (S3, Azure)
- REST API server
- Advanced analytics dashboard
- Performance profiling

### Phase 4
- Docker containerization
- Kubernetes support
- Multi-site coordination
- Distributed crawling

### Phase 5
- Machine learning content analysis
- Content categorization
- Sentiment analysis
- Trend detection

---

## 🤝 Contributing

Contributions welcome! Areas to help:
- Plugin development
- Dashboard improvements
- Performance optimization
- Documentation
- Testing

---

## ⚖️ Legal Notice

This tool is provided for **EDUCATIONAL** and **AUTHORIZED USE ONLY**.

You must obtain explicit written permission from website owners before downloading, mirroring, or scraping. Unauthorized use may violate laws including CFAA, GDPR, CCPA, and website terms of service.

**The authors assume NO LIABILITY for misuse or damages.**

---

## 📞 Support

- 📧 Email: contact@zygor.dev
- 💬 Issues: GitHub Issues
- 🐦 Twitter: @zygorlap
- 📷 Instagram: @zygorlap

---

## 📄 License

MIT License - See LICENSE file for details

---

**Built with ❤️ by @zygorlap**

*The enterprise-grade website mirror and intelligence suite that competes with $2000+ commercial tools.*
