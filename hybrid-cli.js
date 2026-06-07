#!/usr/bin/env node

/**
 * Hybrid Downloader CLI
 * Intelligently selects between built-in scraper and SaveWeb2Zip API
 */

import HybridWebsiteDownloader from './src-hybrid-downloader.js';
import fs from 'fs';
import path from 'path';

const args = process.argv.slice(2);

// Parse arguments
const argDict = {};
for (let i = 0; i < args.length; i += 2) {
  const key = args[i].replace(/^--/, '');
  argDict[key] = args[i + 1] || true;
}

// Display help
if (!argDict.target || argDict.help) {
  console.log(`
╔════════════════════════════════════════════════════════════════╗
║          Zygor Scarper - Hybrid Website Downloader             ║
╚════════════════════════════════════════════════════════════════╝

Smart website copying with intelligent fallback:
  • Tries fast built-in scraper first (private, reliable)
  • Falls back to SaveWeb2Zip API for tricky websites
  • Detects blank pages automatically

USAGE:
  node hybrid-cli.js --target <URL> [OPTIONS]

REQUIRED:
  --target <URL>           Website URL to download

OPTIONS:
  --output <path>          Output directory (default: ./downloads)
  --strategy <method>      'built-in-first' or 'api-first' (default: built-in-first)
  --api-only              Use only SaveWeb2Zip API
  --builtin-only          Use only built-in scraper
  --max-pages <num>       Max pages to include (default: 100)
  --concurrency <num>     Concurrent downloads (default: 3)
  --timeout <ms>          Request timeout in milliseconds (default: 120000)
  --links-only            Only copy linked pages (SaveWeb2Zip)
  --verbose              Show detailed logging
  --help                 Show this help message

EXAMPLES:
  # Simple download (auto-selects best method)
  node hybrid-cli.js --target https://example.com

  # Force API for difficult sites
  node hybrid-cli.js --target https://example.com --strategy api-first

  # Built-in only (no external API)
  node hybrid-cli.js --target https://example.com --builtin-only

  # Multiple URLs from file
  node hybrid-cli.js --target https://example.com https://another.com

  # Custom output and timeout
  node hybrid-cli.js --target https://example.com --output ./my-downloads --timeout 180000

WHAT'S DIFFERENT FROM HTTRACK:
  ✅ Hybrid approach (fast when possible, reliable when needed)
  ✅ Detects blank pages automatically
  ✅ Better JavaScript rendering (via SaveWeb2Zip when needed)
  ✅ No watermarks or broken links
  ✅ Progress tracking and statistics
  ✅ Configurable strategies
  ✅ Better error handling and recovery

PRIVACY:
  By default, only your computer copies sites (built-in scraper).
  SaveWeb2Zip API is only used if built-in scraper fails.
  You can disable API with --builtin-only flag.
`);
  process.exit(0);
}

async function main() {
  try {
    // Get target URL
    let targets = [];
    if (argDict.target) {
      targets = Array.isArray(argDict.target) ? argDict.target : [argDict.target];
    }

    if (targets.length === 0) {
      console.error('❌ No target URL specified. Use --target <URL>');
      process.exit(1);
    }

    const outputDir = argDict.output || './downloads';
    const strategy = argDict['strategy'] || 'built-in-first';

    // Create downloader
    const downloader = new HybridWebsiteDownloader({
      outputDir: outputDir,
      useSaveWeb2Zip: !argDict['builtin-only'],
      useApiFirst: strategy === 'api-first' || argDict['api-only'],
      logger: {
        info: (msg) => argDict.verbose && console.log(`ℹ️  ${msg}`),
        warn: (msg) => console.warn(`⚠️  ${msg}`),
        error: (msg) => console.error(`❌ ${msg}`),
        debug: (msg) => argDict.verbose && console.log(`🐛 ${msg}`),
      },
    });

    // Force API-only if requested
    if (argDict['api-only']) {
      downloader.setStrategy('api-first');
      console.log('🔹 Using SaveWeb2Zip API only');
    }

    // Force built-in only if requested
    if (argDict['builtin-only']) {
      downloader.setAPIEnabled(false);
      console.log('🔹 Using built-in scraper only (no external API)');
    }

    console.log(`\n${'═'.repeat(60)}`);
    console.log('🚀 Hybrid Website Downloader');
    console.log(`${'═'.repeat(60)}\n`);

    console.log(`📍 Strategy: ${strategy}`);
    console.log(`📁 Output: ${path.resolve(outputDir)}\n`);

    // Download
    console.log(`📥 Starting download of ${targets.length} site(s)...\n`);

    const results = await downloader.downloadMultiple(targets, {
      maxPages: parseInt(argDict['max-pages']) || 100,
      concurrency: parseInt(argDict.concurrency) || 3,
      timeout: parseInt(argDict.timeout) || 120000,
      includeLinkedPages: argDict['links-only'],
    });

    // Show results
    console.log(`\n${'═'.repeat(60)}`);
    console.log('📊 Download Results');
    console.log(`${'═'.repeat(60)}\n`);

    results.forEach((result, idx) => {
      const status = result.success ? '✅' : '❌';
      const method = result.method === 'saveweb2zip-api' ? 'API' : 'Built-in';
      const size = result.fileSize
        ? ` (${(result.fileSize / 1024 / 1024).toFixed(2)} MB)`
        : '';

      console.log(`${status} [${idx + 1}] ${result.url}`);
      console.log(`   Method: ${method}${result.usedFallback ? ' (fallback)' : ''}`);

      if (result.success) {
        console.log(
          `   Saved: ${result.outputPath || result.outputDir}${size}`
        );
      } else {
        console.log(`   Error: ${result.error}`);
      }
      console.log();
    });

    // Show statistics
    const stats = downloader.getStats(results);
    console.log(`${'═'.repeat(60)}`);
    console.log('📈 Statistics');
    console.log(`${'═'.repeat(60)}\n`);
    console.log(`Total:          ${stats.total}`);
    console.log(`Successful:     ${stats.successful} (${((stats.successful / stats.total) * 100).toFixed(1)}%)`);
    console.log(`Failed:         ${stats.failed}`);
    console.log(`Built-in used:  ${stats.usedBuiltIn}`);
    console.log(`API used:       ${stats.usedAPI}`);
    if (stats.avgFileSize > 0) {
      console.log(`Avg file size:  ${(stats.avgFileSize / 1024 / 1024).toFixed(2)} MB`);
    }

    // Exit status
    const exitCode = stats.failed > 0 ? 1 : 0;
    if (exitCode === 0) {
      console.log(`\n✨ All downloads completed successfully!\n`);
    } else {
      console.log(`\n⚠️  ${stats.failed} download(s) failed\n`);
    }

    process.exit(exitCode);
  } catch (error) {
    console.error(`\n❌ Fatal error: ${error.message}`);
    console.error(error.stack);
    process.exit(1);
  }
}

main();
