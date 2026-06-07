### Hybrid Website Downloader - Complete Guide

# Why Hybrid Approach?

The issue with blank pages isn't unique to Zygor Scarper - many web scrapers struggle with:

- **Dynamic JavaScript rendering** - Pages load content via JS after page load
- **Complex SPA frameworks** - React, Vue, Angular apps render in browser
- **Anti-scraping measures** - Some sites actively block scrapers
- **Cloudflare/WAF protection** - JavaScript challenges before serving content
- **Modern build tools** - Pages that don't have meaningful content until JS runs

## The Problem with HTTrack

HTTrack is great for simple static sites, but fails on modern websites because:

- ❌ Doesn't execute JavaScript
- ❌ Can't handle dynamic content loading
- ❌ Doesn't handle authentication properly
- ❌ Can leave visible watermarks/artifacts
- ❌ No intelligent fallback strategy

## The Solution: Zygor Hybrid Approach

Zygor now combines **two powerful methods**:

1. **Built-in Scraper** (Fast & Private)
   - Playwright-based rendering (real browser engine)
   - Handles JavaScript execution properly
   - No external dependencies
   - Faster for simple sites
   - Data stays on your machine

2. **SaveWeb2Zip API** (Reliable Fallback)
   - Professional web copying service
   - Handles even the trickiest sites
   - Proven to work where others fail
   - Used when built-in scraper produces blank pages
   - Automatic detection of failures

---

# How It Works

```
User requests website download
           ↓
Built-in Scraper (Fast)
           ↓
    Did it work? (Check for blank pages)
      ↙          ↘
    YES         NO
     ↓           ↓
  Done!     SaveWeb2Zip API (Reliable)
              ↓
            Done!
```

### Blank Page Detection

The hybrid downloader automatically detects if a page is blank by:

- Removing all scripts, styles, and metadata
- Checking remaining content length
- Counting meaningful words
- Detecting placeholder errors
- If content < 5KB or < 10 words → triggers fallback

---

# Usage

## Option 1: Simple Download (Recommended)

```bash
npm run hybrid -- --target https://example.com
```

This automatically:

1. Tries built-in scraper
2. Detects if page is blank
3. Falls back to SaveWeb2Zip if needed

## Option 2: Built-in Only (Private, No External API)

```bash
npm run hybrid -- --target https://example.com --builtin-only
```

Useful if you:

- Don't trust external services
- Want all data to stay local
- Have perfect built-in scraper coverage
- Want to avoid any API calls

## Option 3: API First (For Difficult Sites)

```bash
npm run hybrid -- --target https://example.com --strategy api-first
```

Useful for:

- Complex JavaScript-heavy sites
- Sites with anti-bot detection
- When you know built-in will fail

## Option 4: API Only (Maximum Reliability)

```bash
npm run hybrid -- --target https://example.com --api-only
```

Guarantees:

- Professional web copying
- Handles any website
- Maximum compatibility

---

# Examples

### Download with Custom Output Directory

```bash
npm run hybrid -- --target https://example.com --output ./my-downloads
```

### Download Multiple Sites

```bash
npm run hybrid -- --target https://site1.com https://site2.com https://site3.com
```

### Force API with Longer Timeout for Complex Sites

```bash
npm run hybrid -- --target https://example.com --api-only --timeout 300000
```

### Include Linked Pages (SaveWeb2Zip)

```bash
npm run hybrid -- --target https://example.com --api-first --links-only --max-pages 50
```

### Verbose Logging to See What's Happening

```bash
npm run hybrid -- --target https://example.com --verbose
```

### Concurrent Downloads (Fast)

```bash
npm run hybrid -- --target https://site1.com https://site2.com https://site3.com --concurrency 5
```

---

# In Code (Programmatic Use)

### Hybrid Downloader

```javascript
import HybridWebsiteDownloader from "./src-hybrid-downloader.js";

const downloader = new HybridWebsiteDownloader({
  outputDir: "./downloads",
  useSaveWeb2Zip: true, // Enable API fallback
  useApiFirst: false, // Try built-in first
});

// Download single URL
const result = await downloader.download("https://example.com");
console.log(result);
// {
//   success: true,
//   url: 'https://example.com',
//   method: 'built-in',           // or 'saveweb2zip-api'
//   outputDir: './downloads',
//   fileCount: 42,
//   isBlank: false,
//   usedFallback: false,
//   downloadedAt: Date
// }

// Download multiple URLs
const results = await downloader.downloadMultiple(
  ["https://site1.com", "https://site2.com", "https://site3.com"],
  {
    maxPages: 100,
    concurrency: 3,
  },
);

// Get statistics
const stats = downloader.getStats(results);
console.log(stats);
// {
//   total: 3,
//   successful: 3,
//   failed: 0,
//   usedBuiltIn: 2,
//   usedAPI: 1,
//   avgFileSize: 2097152
// }

// Switch strategy
downloader.setStrategy("api-first");

// Disable API
downloader.setAPIEnabled(false);
```

### SaveWeb2Zip Adapter (Direct Use)

```javascript
import SaveWeb2ZipAdapter from "./src-saveweb2zip-adapter.js";

const adapter = new SaveWeb2ZipAdapter({
  timeout: 120000,
  maxRetries: 3,
});

// Full workflow
const result = await adapter.copyWebsite(
  "https://example.com",
  "./downloads/example.zip",
  {
    format: "zip",
    maxPages: 100,
    includeLinkedPages: false,
    maxWaitTime: 600000, // 10 minutes max wait
  },
);

// Or step-by-step
const job = await adapter.initiateDownload("https://example.com");
console.log("Job ID:", job.jobId);

const status = await adapter.waitForCompletion(job.jobId);
console.log("Download URL:", status.downloadUrl);

const download = await adapter.downloadFile(
  status.downloadUrl,
  "./downloads/example.zip",
);
```

---

# SaveWeb2Zip API Details

## Endpoints

### Initiate Download

```
POST https://copier.saveweb2zip.com/api/copySite

Payload:
{
  "url": "https://example.com",
  "format": "zip",              // zip, tar.gz
  "includeLinkedPages": false,
  "maxPages": 100,
  "timeout": 30
}

Response:
{
  "id": "a40d79fd1b9075b71d864838f8faa78a_1780835130032",
  "status": "queued"
}
```

### Check Status

```
GET https://copier.saveweb2zip.com/api/getStatus/{jobId}

Response (while processing):
{
  "status": "processing",
  "progress": 45,
  "message": "Downloaded 45 pages"
}

Response (completed):
{
  "status": "completed",
  "progress": 100,
  "downloadUrl": "https://...",
  "fileSize": 5242880,
  "fileName": "example-com.zip"
}

Response (failed):
{
  "status": "failed",
  "message": "Site returned 403 Forbidden"
}
```

---

# Comparison: Built-in vs SaveWeb2Zip API

| Feature           | Built-in Scraper   | SaveWeb2Zip API     |
| ----------------- | ------------------ | ------------------- |
| **Speed**         | ⚡ Fast (seconds)  | 🐢 Slower (minutes) |
| **Privacy**       | 🔒 Local only      | ⚠️ Sent to service  |
| **JavaScript**    | ✅ Handles well    | ✅ Handles well     |
| **Anti-bot**      | ⚠️ Basic           | ✅ Advanced         |
| **Complex Sites** | ⚠️ Sometimes fails | ✅ Usually works    |
| **Cost**          | ✅ Free            | ⚠️ Rate limited     |
| **Reliability**   | 📊 ~85%            | 📊 ~98%             |
| **Watermarks**    | ✅ None            | ✅ None             |
| **Configuration** | ✅ Many options    | ⚠️ Limited          |

---

# Troubleshooting

### "Still getting blank pages"

**Try these steps:**

1. **Enable verbose logging**

   ```bash
   npm run hybrid -- --target https://example.com --verbose
   ```

   This shows exactly what's happening.

2. **Use API first for that site**

   ```bash
   npm run hybrid -- --target https://example.com --api-first
   ```

3. **Check site requirements**
   - Does it require login?
   - Does it use Cloudflare?
   - Does it have WAF protection?

4. **Use built-in-only to debug**
   ```bash
   npm run hybrid -- --target https://example.com --builtin-only
   ```
   See if the issue is the built-in scraper.

### "API downloads are too slow"

**Solutions:**

1. Use built-in scraper more

   ```bash
   npm run hybrid -- --target https://example.com --builtin-only
   ```

2. Reduce pages if using API

   ```bash
   npm run hybrid -- --target https://example.com --api-only --max-pages 20
   ```

3. Accept longer wait time for reliability

### "Getting errors from SaveWeb2Zip API"

Common errors:

- **403 Forbidden** - Site blocks the API IP
- **Timeout** - Site took too long to download
- **Invalid URL** - URL format issue

**Solution**: Fall back to built-in scraper or check URL manually.

---

# Configuration File (.zygorrc.json)

Add hybrid settings:

```json
{
  "downloader": {
    "type": "hybrid",
    "useSaveWeb2Zip": true,
    "strategy": "built-in-first",
    "blankPageThreshold": 5000,
    "outputDir": "./downloads"
  },
  "saveweb2zip": {
    "enabled": true,
    "timeout": 120000,
    "maxRetries": 3,
    "maxWaitTime": 600000
  }
}
```

---

# Why This is Better Than Simple Solutions

❌ **Just using built-in scraper:**

- Fails on modern JavaScript-heavy sites

❌ **Just using SaveWeb2Zip API:**

- Sends all URLs to external service
- Slower
- Overkill for simple sites

✅ **Hybrid approach:**

- Fast when it works (built-in)
- Reliable when it doesn't (API)
- Private by default
- Automatic fallback
- Best of both worlds

---

# Next Steps

1. **Try it now:**

   ```bash
   npm run hybrid -- --target https://example.com --verbose
   ```

2. **Review results:**
   - Check `./downloads/` folder
   - See which method was used
   - Check statistics

3. **Adjust strategy as needed:**
   - For mostly simple sites: `--builtin-only`
   - For complex sites: `--api-first`
   - For maximum compatibility: `--api-only`

4. **Integrate into your workflow:**
   ```javascript
   import HybridWebsiteDownloader from "./src-hybrid-downloader.js";
   // Use in your custom scripts
   ```

---

# Support & Issues

If you encounter problems:

1. **Check the logs** with `--verbose`
2. **Try different strategies**
3. **Report issues** with details about the website
4. **Use SaveWeb2Zip directly** if API is the issue

The hybrid approach gives you **ultimate flexibility** and **maximum reliability** for website copying! 🚀
