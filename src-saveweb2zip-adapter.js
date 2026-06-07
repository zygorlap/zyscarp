/**
 * SaveWeb2Zip API Adapter
 * Integrates with https://copier.saveweb2zip.com for advanced website copying
 * Used as fallback when built-in scraper produces blank pages
 */

import axios from 'axios';
import { EventEmitter } from 'events';

class SaveWeb2ZipAdapter extends EventEmitter {
  constructor(options = {}) {
    super();
    
    this.apiBase = 'https://copier.saveweb2zip.com';
    this.timeout = options.timeout || 120000; // 2 minutes
    this.maxRetries = options.maxRetries || 3;
    this.retryDelay = options.retryDelay || 5000; // 5 seconds
    this.enabled = options.enabled !== false;
    this.logger = options.logger || console;
  }

  /**
   * Initiate website copying via SaveWeb2Zip API
   * @param {string} url - Target website URL
   * @param {object} options - Copy options
   * @returns {Promise<object>} Status with job ID
   */
  async initiateDownload(url, options = {}) {
    if (!this.enabled) {
      throw new Error('SaveWeb2Zip adapter is disabled');
    }

    if (!this._isValidUrl(url)) {
      throw new Error(`Invalid URL: ${url}`);
    }

    try {
      this.logger.info(`[SaveWeb2Zip] Initiating download for: ${url}`);

      const payload = {
        url: url,
        format: options.format || 'zip', // zip, tar.gz, etc
        includeLinkedPages: options.includeLinkedPages ?? false,
        maxPages: options.maxPages || 100,
        timeout: options.timeout || 30,
      };

      const response = await axios.post(
        `${this.apiBase}/api/copySite`,
        payload,
        {
          timeout: this.timeout,
          headers: {
            'Content-Type': 'application/json',
            'User-Agent': 'Zygor-Scarper/3.2.0',
          },
        }
      );

      if (!response.data || !response.data.id) {
        throw new Error('No job ID returned from SaveWeb2Zip API');
      }

      this.logger.info(`[SaveWeb2Zip] Job created: ${response.data.id}`);
      this.emit('job-created', { jobId: response.data.id, url });

      return {
        jobId: response.data.id,
        url: url,
        status: 'queued',
        createdAt: new Date(),
      };
    } catch (error) {
      this.logger.error(`[SaveWeb2Zip] Initiate failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * Check job status and download when ready
   * @param {string} jobId - SaveWeb2Zip job ID
   * @returns {Promise<object>} Job status and download URL
   */
  async getStatus(jobId) {
    if (!this._isValidJobId(jobId)) {
      throw new Error(`Invalid job ID: ${jobId}`);
    }

    try {
      const response = await axios.get(
        `${this.apiBase}/api/getStatus/${jobId}`,
        {
          timeout: this.timeout,
          headers: {
            'User-Agent': 'Zygor-Scarper/3.2.0',
          },
        }
      );

      const status = response.data.status || 'unknown';
      const result = {
        jobId: jobId,
        status: status, // queued, processing, completed, failed
        progress: response.data.progress || 0,
        message: response.data.message || '',
      };

      // Add download URL when ready
      if (status === 'completed' && response.data.downloadUrl) {
        result.downloadUrl = response.data.downloadUrl;
        result.fileSize = response.data.fileSize;
        result.fileName = response.data.fileName;
      }

      // Log failures
      if (status === 'failed') {
        this.logger.error(`[SaveWeb2Zip] Job ${jobId} failed: ${result.message}`);
      }

      this.emit('status-update', result);
      return result;
    } catch (error) {
      this.logger.error(`[SaveWeb2Zip] Status check failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * Poll job status until completion
   * @param {string} jobId - SaveWeb2Zip job ID
   * @param {object} options - Poll options
   * @returns {Promise<object>} Completed job status with download URL
   */
  async waitForCompletion(jobId, options = {}) {
    const maxWaitTime = options.maxWaitTime || 600000; // 10 minutes
    const pollInterval = options.pollInterval || 5000; // 5 seconds
    const startTime = Date.now();

    this.logger.info(`[SaveWeb2Zip] Waiting for job ${jobId} to complete...`);

    while (Date.now() - startTime < maxWaitTime) {
      try {
        const status = await this.getStatus(jobId);

        if (status.status === 'completed') {
          this.logger.info(`[SaveWeb2Zip] Job ${jobId} completed`);
          this.emit('job-completed', status);
          return status;
        }

        if (status.status === 'failed') {
          throw new Error(`Job failed: ${status.message}`);
        }

        this.logger.debug(`[SaveWeb2Zip] Job ${jobId} progress: ${status.progress}%`);

        // Wait before next poll
        await this._delay(pollInterval);
      } catch (error) {
        this.logger.error(`[SaveWeb2Zip] Poll error: ${error.message}`);
        throw error;
      }
    }

    throw new Error(`Job ${jobId} did not complete within ${maxWaitTime}ms`);
  }

  /**
   * Download completed file
   * @param {string} downloadUrl - Download URL from completed job
   * @param {string} outputPath - Where to save the file
   * @returns {Promise<object>} Download result
   */
  async downloadFile(downloadUrl, outputPath) {
    if (!downloadUrl || !outputPath) {
      throw new Error('downloadUrl and outputPath are required');
    }

    try {
      this.logger.info(`[SaveWeb2Zip] Downloading to: ${outputPath}`);

      const response = await axios.get(downloadUrl, {
        responseType: 'arraybuffer',
        timeout: this.timeout,
      });

      // Save to file (you'll need to integrate with your file system)
      this.emit('download-ready', {
        url: downloadUrl,
        outputPath: outputPath,
        size: response.data.length,
      });

      return {
        success: true,
        outputPath: outputPath,
        size: response.data.length,
        downloadedAt: new Date(),
      };
    } catch (error) {
      this.logger.error(`[SaveWeb2Zip] Download failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * Full workflow: initiate → wait → download
   * @param {string} url - Target website URL
   * @param {string} outputPath - Where to save
   * @param {object} options - Combined options
   * @returns {Promise<object>} Final result
   */
  async copyWebsite(url, outputPath, options = {}) {
    try {
      this.logger.info(`[SaveWeb2Zip] Starting full copy workflow for ${url}`);

      // Step 1: Initiate
      const initResult = await this.initiateDownload(url, options);
      const jobId = initResult.jobId;

      // Step 2: Wait for completion
      const statusResult = await this.waitForCompletion(jobId, options);

      if (!statusResult.downloadUrl) {
        throw new Error('No download URL in completed status');
      }

      // Step 3: Download
      const downloadResult = await this.downloadFile(
        statusResult.downloadUrl,
        outputPath
      );

      this.logger.info(`[SaveWeb2Zip] Copy workflow complete`);

      return {
        success: true,
        url: url,
        jobId: jobId,
        outputPath: outputPath,
        fileSize: downloadResult.size,
        completedAt: new Date(),
      };
    } catch (error) {
      this.logger.error(`[SaveWeb2Zip] Copy workflow failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * Enable/disable adapter
   */
  setEnabled(enabled) {
    this.enabled = enabled;
    this.logger.info(`[SaveWeb2Zip] Adapter ${enabled ? 'enabled' : 'disabled'}`);
  }

  /**
   * Validate URL format
   */
  _isValidUrl(url) {
    try {
      new URL(url);
      return /^https?:\/\/.+/.test(url);
    } catch {
      return false;
    }
  }

  /**
   * Validate job ID format
   */
  _isValidJobId(jobId) {
    return typeof jobId === 'string' && jobId.length > 0;
  }

  /**
   * Helper delay function
   */
  _delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

export default SaveWeb2ZipAdapter;
