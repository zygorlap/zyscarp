export class ErrorBypass {
  constructor(maxRetries = 7, retryDelay = 2000) {
    this.maxRetries = maxRetries;
    this.retryDelay = retryDelay;
    this.errorLog = [];
    this.bypassStrategies = {
      timeout: e => e.message?.includes('timeout'),
      network: e => e.message?.includes('ECONNREFUSED') || e.message?.includes('ENOTFOUND') || e.message?.includes('ECONNRESET'),
      rate_limit: e => e.status === 429 || e.message?.includes('rate limit'),
      auth: e => e.status === 401 || e.status === 403,
      server_error: e => e.status >= 500,
      not_found: e => e.status === 404,
      partial: e => e.code === 'ERR_INCOMPLETE_RESPONSE',
      ssl: e => e.message?.includes('certificate') || e.message?.includes('SSL')
    };
  }

  classifyError(error) {
    for (const [type, condition] of Object.entries(this.bypassStrategies)) {
      if (condition(error)) return type;
    }
    return 'unknown';
  }

  getBypassStrategy(errorType) {
    const strategies = {
      timeout: { action: 'increase_timeout', multiplier: 1.5, retry: true },
      network: { action: 'proxy_rotation', delay: 3000, retry: true },
      rate_limit: { action: 'exponential_backoff', delay: 5000, retry: true },
      auth: { action: 'add_auth_headers', delay: 2000, retry: true },
      server_error: { action: 'defer_request', delay: 10000, retry: true },
      not_found: { action: 'skip', retry: false },
      partial: { action: 'retry_with_new_connection', delay: 2000, retry: true },
      ssl: { action: 'ignore_ssl', delay: 1000, retry: true },
      unknown: { action: 'continue', delay: 1000, retry: true }
    };
    return strategies[errorType] || strategies.unknown;
  }

  async executeWithBypass(asyncFn, context = {}) {
    let lastError = null;
    let timeoutMultiplier = 1;

    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      try {
        if (attempt > 1) {
          const delay = this.retryDelay * Math.pow(1.5, attempt - 2);
          console.log(`[RETRY ${attempt}/${this.maxRetries}] waiting ${Math.round(delay)}ms`);
          await this.sleep(delay);
        }
        const timeout = context.timeout ? context.timeout * timeoutMultiplier : 30000;
        return await asyncFn({ ...context, timeout, attempt });
      } catch (error) {
        lastError = error;
        const errorType = this.classifyError(error);
        const strategy = this.getBypassStrategy(errorType);
        this.errorLog.push({
          attempt, error: error.message, type: errorType,
          strategy: strategy.action, timestamp: new Date().toISOString()
        });
        console.log(`[FAIL ${attempt}] ${errorType}: ${error.message}`);
        switch (strategy.action) {
          case 'increase_timeout':
            timeoutMultiplier *= strategy.multiplier;
            break;
          case 'exponential_backoff':
            await this.sleep(strategy.delay * Math.pow(2, attempt - 1));
            break;
          case 'proxy_rotation':
          case 'defer_request':
            await this.sleep(strategy.delay);
            break;
          case 'skip':
            return null;
          default:
            await this.sleep(strategy.delay || 1000);
        }
        if (!strategy.retry || attempt === this.maxRetries) break;
      }
    }
    console.warn(`[GIVE UP] after ${this.maxRetries} attempts`);
    return { error: lastError, attempts: this.maxRetries, success: false };
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  getErrorReport() {
    return {
      total_errors: this.errorLog.length,
      by_type: this.groupBy(this.errorLog, 'type'),
      by_strategy: this.groupBy(this.errorLog, 'strategy'),
      errors: this.errorLog
    };
  }

  groupBy(array, key) {
    return array.reduce((acc, obj) => {
      acc[obj[key]] = (acc[obj[key]] || 0) + 1;
      return acc;
    }, {});
  }
}

export default ErrorBypass;
