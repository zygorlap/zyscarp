/**
 * Hybrid Website Downloader with Smart Fallback
 * Uses built-in scraper first, falls back to SaveWeb2Zip API for difficult sites
 */

import fs from 'fs';
import path from 'path';
import WebsiteDownloader from './src-website-downloader.js';
import SaveWeb2ZipAdapter from './src-saveweb2zip-adapter.js';

class HybridWebsiteDownloader {
  constructor(options = {}) {
    this.builtInDownloader = new WebsiteDownloader(options);
    this.saveweb2zipAdapter = new SaveWeb2ZipAdapter({
      enabled: options.useSaveWeb2Zip !== false,
      logger: options.logger || console,
      timeout: options.apiTimeout || 120000,
    });

    this.logger = options.logger || console;
    this.fallbackThreshold = options.fallbackThreshold || 5000; // Min KB for "not blank"
    this.outputDir = options.outputDir || './downloads';
    this.useApiFirst = options.useApiFirst || false; // If true, tries API first
  }

  /**
   * Detect if downloaded content appears to be blank
   * @param {string} htmlContent - HTML content to check
   * @returns {boolean} True if content appears blank
   */
  _isBlankContent(htmlContent) {
    if (!htmlContent || htmlContent.trim().length === 0) {
      return true;
    }

    // Remove scripts, styles, and metadata
    let cleanHtml = htmlContent
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
      .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
      .replace(/<meta[^>]*>/gi, '')
      .replace(/<link[^>]*>/gi, '')
      .replace(/<\/?[^>]+(>|$)/g, ''); // Strip tags

    const contentLength = cleanHtml.trim().length;
    const wordCount = cleanHtml.trim().split(/\s+/).length;

    // Consider blank if:
    // - Less than threshold characters
    // - Less than 10 meaningful words
    // - Only common placeholder text
    const isBlank =
      contentLength < this.fallbackThreshold ||
      wordCount < 10 ||
      /^(loading|error|page not found|403|404)$/i.test(cleanHtml.trim());

    if (isBlank) {
      this.logger.warn(
        `[Hybrid] Content appears blank: ${contentLength} chars, ${wordCount} words`
      );
    }

    return isBlank;
  }

  /**
   * Main download method with intelligent fallback
   * @param {string} url - Website URL to download
   * @param {object} options - Download options
   * @returns {Promise<object>} Download result
   */
  async download(url, options = {}) {
    const method1 = this.useApiFirst ? 'api' : 'built-in';
    const method2 = this.useApiFirst ? 'built-in' : 'api';

    this.logger.info(
      `[Hybrid] Starting download: ${url} (Primary: ${method1}, Fallback: ${method2})`
    );

    try {
      // Try primary method
      if (method1 === 'built-in') {
        const result = await this._tryBuiltInDownload(url, options);
        if (result.success && !result.usedFallback) {
          return result;
        }
        this.logger.warn('[Hybrid] Built-in download may have failed, trying SaveWeb2Zip API...');
      } else {
        const result = await this._trySaveWeb2ZipDownload(url, options);
        if (result.success) {
          return result;
        }
        this.logger.warn('[Hybrid] API download may have failed, trying built-in scraper...');
      }

      // Try fallback method
      if (method2 === 'built-in') {
        return await this._tryBuiltInDownload(url, { ...options, force: true });
      } else {
        return await this._trySaveWeb2ZipDownload(url, options);
      }
    } catch (error) {
      this.logger.error(`[Hybrid] Download failed: ${error.message}`);
      return {
        success: false,
        url: url,
        error: error.message,
        method: 'hybrid',
      };
    }
  }

  /**
   * Try built-in downloader
   */
  async _tryBuiltInDownload(url, options = {}) {
    try {
      this.logger.info('[Hybrid] Attempting built-in scraper...');

      const result = await this.builtInDownloader.download(url, {
        ...options,
        outputDir: this.outputDir,
      });

      // Check if content is blank
      if (result.htmlPath && fs.existsSync(result.htmlPath)) {
        const htmlContent = fs.readFileSync(result.htmlPath, 'utf-8');
        const isBlank = this._isBlankContent(htmlContent);

        return {
          success: !isBlank,
          url: url,
          method: 'built-in',
          outputDir: result.outputDir,
          fileCount: result.fileCount || 0,
          isBlank: isBlank,
          usedFallback: false,
          downloadedAt: new Date(),
        };
      }

      return {
        success: result.success,
        url: url,
        method: 'built-in',
        outputDir: result.outputDir,
        fileCount: result.fileCount || 0,
        usedFallback: false,
      };
    } catch (error) {
      this.logger.error(`[Hybrid] Built-in download error: ${error.message}`);
      return {
        success: false,
        url: url,
        method: 'built-in',
        error: error.message,
        usedFallback: false,
      };
    }
  }

  /**
   * Try SaveWeb2Zip API download
   */
  async _trySaveWeb2ZipDownload(url, options = {}) {
    if (!this.saveweb2zipAdapter.enabled) {
      this.logger.warn('[Hybrid] SaveWeb2Zip adapter is disabled');
      return {
        success: false,
        url: url,
        method: 'api',
        error: 'SaveWeb2Zip adapter disabled',
      };
    }

    try {
      this.logger.info('[Hybrid] Attempting SaveWeb2Zip API...');

      // Ensure output directory exists
      if (!fs.existsSync(this.outputDir)) {
        fs.mkdirSync(this.outputDir, { recursive: true });
      }

      const domainName = new URL(url).hostname.replace('www.', '');
      const zipFileName = `${domainName}-${Date.now()}.zip`;
      const outputPath = path.join(this.outputDir, zipFileName);

      const result = await this.saveweb2zipAdapter.copyWebsite(url, outputPath, {
        format: 'zip',
        includeLinkedPages: options.includeLinkedPages ?? false,
        maxPages: options.maxPages || 100,
        maxWaitTime: options.maxWaitTime || 300000, // 5 minutes
      });

      return {
        success: result.success,
        url: url,
        method: 'saveweb2zip-api',
        outputPath: result.outputPath,
        fileSize: result.fileSize,
        jobId: result.jobId,
        usedFallback: true,
        downloadedAt: result.completedAt,
      };
    } catch (error) {
      this.logger.error(`[Hybrid] SaveWeb2Zip download error: ${error.message}`);
      return {
        success: false,
        url: url,
        method: 'saveweb2zip-api',
        error: error.message,
        usedFallback: true,
      };
    }
  }

  /**
   * Download multiple URLs with smart method selection
   * @param {array} urls - Array of URLs
   * @param {object} options - Download options
   * @returns {Promise<array>} Results for each URL
   */
  async downloadMultiple(urls, options = {}) {
    const results = [];
    const concurrency = options.concurrency || 3;

    this.logger.info(
      `[Hybrid] Starting batch download: ${urls.length} URLs (concurrency: ${concurrency})`
    );

    for (let i = 0; i < urls.length; i += concurrency) {
      const batch = urls.slice(i, i + concurrency);
      const batchResults = await Promise.all(
        batch.map(url => this.download(url, options))
      );
      results.push(...batchResults);
    }

    const successful = results.filter(r => r.success).length;
    this.logger.info(
      `[Hybrid] Batch complete: ${successful}/${urls.length} successful`
    );

    return results;
  }

  /**
   * Get statistics on download methods used
   */
  getStats(results) {
    return {
      total: results.length,
      successful: results.filter(r => r.success).length,
      failed: results.filter(r => !r.success).length,
      usedBuiltIn: results.filter(r => r.method === 'built-in').length,
      usedAPI: results.filter(r => r.method === 'saveweb2zip-api').length,
      avgFileSize: results
        .filter(r => r.fileSize)
        .reduce((sum, r) => sum + r.fileSize, 0) /
        results.filter(r => r.fileSize).length || 0,
    };
  }

  /**
   * Enable/disable SaveWeb2Zip API
   */
  setAPIEnabled(enabled) {
    this.saveweb2zipAdapter.setEnabled(enabled);
  }

  /**
   * Switch between built-in-first and API-first strategies
   */
  setStrategy(strategy) {
    this.useApiFirst = strategy === 'api-first';
    this.logger.info(`[Hybrid] Strategy set to: ${strategy}`);
  }
}

export default HybridWebsiteDownloader;
