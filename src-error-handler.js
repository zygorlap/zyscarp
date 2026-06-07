export class ZygorError extends Error {
  constructor(message, code = 'UNKNOWN', context = {}) {
    super(message);
    this.name = this.constructor.name;
    this.code = code;
    this.context = context;
    this.timestamp = new Date().toISOString();
  }

  toJSON() {
    return {
      name: this.name,
      code: this.code,
      message: this.message,
      context: this.context,
      timestamp: this.timestamp,
      stack: this.stack
    };
  }
}

export class NetworkError extends ZygorError {
  constructor(message, statusCode = null, url = null) {
    super(message, 'NETWORK_ERROR', { statusCode, url });
    this.statusCode = statusCode;
    this.url = url;
  }
}

export class TimeoutError extends ZygorError {
  constructor(message, url = null, timeout = null) {
    super(message, 'TIMEOUT', { url, timeout });
    this.url = url;
    this.timeout = timeout;
  }
}

export class ParseError extends ZygorError {
  constructor(message, content = null) {
    super(message, 'PARSE_ERROR', { contentLength: content?.length });
    this.content = content;
  }
}

export class ValidationError extends ZygorError {
  constructor(message, field = null, value = null) {
    super(message, 'VALIDATION_ERROR', { field, value });
    this.field = field;
    this.value = value;
  }
}

export class ResourceError extends ZygorError {
  constructor(message, resourceType = null) {
    super(message, 'RESOURCE_ERROR', { resourceType });
    this.resourceType = resourceType;
  }
}

export class AuthenticationError extends ZygorError {
  constructor(message, authType = null) {
    super(message, 'AUTH_ERROR', { authType });
    this.authType = authType;
  }
}

export class RateLimitError extends ZygorError {
  constructor(message, retryAfter = null) {
    super(message, 'RATE_LIMIT', { retryAfter });
    this.retryAfter = retryAfter;
  }
}

export class ErrorHandler {
  constructor(logger = console) {
    this.logger = logger;
    this.errorCounts = {};
    this.errorHistory = [];
    this.maxHistorySize = 1000;
  }

  handle(error, context = {}) {
    let zygorError;

    if (error instanceof ZygorError) {
      zygorError = error;
    } else if (error.code === 'ENOTFOUND') {
      zygorError = new NetworkError(`DNS lookup failed: ${error.message}`, null, context.url);
    } else if (error.code === 'ECONNREFUSED') {
      zygorError = new NetworkError(`Connection refused`, null, context.url);
    } else if (error.code === 'ETIMEDOUT' || error.code === 'ESOCKETTIMEDOUT') {
      zygorError = new TimeoutError(`Request timeout`, context.url, context.timeout);
    } else if (error.response?.status >= 400) {
      zygorError = new NetworkError(`HTTP ${error.response.status}`, error.response.status, context.url);
    } else {
      zygorError = new ZygorError(error.message, 'UNKNOWN', context);
    }

    this.recordError(zygorError);
    return zygorError;
  }

  recordError(error) {
    const code = error.code || 'UNKNOWN';
    this.errorCounts[code] = (this.errorCounts[code] || 0) + 1;

    this.errorHistory.push({
      error: error.toJSON ? error.toJSON() : error,
      timestamp: Date.now()
    });

    // Keep history size under control
    if (this.errorHistory.length > this.maxHistorySize) {
      this.errorHistory.shift();
    }

    this.log(error);
  }

  log(error) {
    if (this.logger?.error) {
      this.logger.error(error.toJSON ? error.toJSON() : error);
    }
  }

  shouldRetry(error, retryCount = 0, maxRetries = 5) {
    if (retryCount >= maxRetries) return false;

    if (error instanceof TimeoutError) return retryCount < 3;
    if (error instanceof RateLimitError) return true;
    if (error instanceof NetworkError) {
      const status = error.statusCode;
      return status === 429 || status === 503 || status === 504 || status >= 500;
    }

    return false;
  }

  getRetryDelay(error, retryCount = 0) {
    // Exponential backoff with jitter
    const baseDelay = 500;
    const exponentialDelay = baseDelay * Math.pow(2, retryCount);
    const jitter = Math.random() * 200;
    
    if (error instanceof RateLimitError && error.retryAfter) {
      return Math.max(error.retryAfter * 1000, exponentialDelay + jitter);
    }

    return Math.min(exponentialDelay + jitter, 30000); // Max 30 seconds
  }

  getErrorSummary() {
    return {
      totalErrors: this.errorHistory.length,
      byCode: this.errorCounts,
      recentErrors: this.errorHistory.slice(-10)
    };
  }

  formatErrorMessage(error, includeStack = false) {
    let msg = `[${error.code || 'ERROR'}] ${error.message}`;
    
    if (error.context?.url) {
      msg += ` (${error.context.url})`;
    }

    if (includeStack && error.stack) {
      msg += `\n${error.stack}`;
    }

    return msg;
  }

  export() {
    return {
      summary: this.getErrorSummary(),
      fullHistory: this.errorHistory,
      counts: this.errorCounts
    };
  }
}

export default { ZygorError, NetworkError, TimeoutError, ParseError, ValidationError, ResourceError, AuthenticationError, RateLimitError, ErrorHandler };
