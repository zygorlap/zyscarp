/**
 * Plugin System for Zygor Scarper
 * Allows extending functionality through hooks and plugins
 */

export class PluginManager {
  constructor() {
    this.plugins = new Map();
    this.hooks = new Map();
    this.middleware = [];
  }

  /**
   * Register a plugin
   */
  register(name, plugin) {
    if (typeof plugin !== 'object' || !plugin.name) {
      throw new Error('Plugin must be an object with a "name" property');
    }

    this.plugins.set(name, plugin);
    
    // Register hooks
    if (plugin.hooks) {
      for (const [hookName, handler] of Object.entries(plugin.hooks)) {
        this.registerHook(hookName, handler);
      }
    }

    return this;
  }

  /**
   * Register a hook
   */
  registerHook(name, handler) {
    if (!this.hooks.has(name)) {
      this.hooks.set(name, []);
    }
    this.hooks.get(name).push(handler);
  }

  /**
   * Execute a hook
   */
  async executeHook(name, context = {}) {
    if (!this.hooks.has(name)) return context;

    const handlers = this.hooks.get(name);
    for (const handler of handlers) {
      try {
        context = await handler(context);
      } catch (e) {
        console.error(`Hook ${name} error: ${e.message}`);
      }
    }

    return context;
  }

  /**
   * Get list of plugins
   */
  getPlugins() {
    return Array.from(this.plugins.values());
  }
}

/**
 * Built-in plugins
 */

export const MetricsPlugin = {
  name: 'metrics',
  version: '1.0.0',
  hooks: {
    'before-crawl': async (context) => {
      context.startTime = Date.now();
      return context;
    },
    'after-crawl': async (context) => {
      context.duration = Date.now() - context.startTime;
      return context;
    }
  }
};

export const FilterPlugin = {
  name: 'url-filter',
  version: '1.0.0',
  config: {
    exclude: ['/admin', '/login', '/api'],
    include: ['/*']
  },
  hooks: {
    'before-fetch': async (context) => {
      const { url, config } = context;
      for (const pattern of (config.exclude || [])) {
        if (url.includes(pattern)) {
          context.skip = true;
          break;
        }
      }
      return context;
    }
  }
};

export const CachePlugin = {
  name: 'cache',
  version: '1.0.0',
  cache: new Map(),
  hooks: {
    'before-fetch': async (context) => {
      const { url } = context;
      if (this.cache.has(url)) {
        context.cached = this.cache.get(url);
        context.fromCache = true;
      }
      return context;
    },
    'after-fetch': async (context) => {
      const { url, data } = context;
      this.cache.set(url, data);
      return context;
    }
  }
};

export const ErrorRecoveryPlugin = {
  name: 'error-recovery',
  version: '1.0.0',
  maxRetries: 5,
  hooks: {
    'on-error': async (context) => {
      const { error, retryCount = 0 } = context;
      if (retryCount < this.maxRetries) {
        const delay = Math.pow(2, retryCount) * 1000;
        context.shouldRetry = true;
        context.retryDelay = delay;
      }
      return context;
    }
  }
};

export const NotificationPlugin = {
  name: 'notifications',
  version: '1.0.0',
  config: {
    webhookUrl: null,
    events: ['complete', 'error']
  },
  hooks: {
    'on-complete': async (context) => {
      if (this.config.webhookUrl && this.config.events.includes('complete')) {
        // Send webhook notification
        console.log(`Webhook sent to ${this.config.webhookUrl}`);
      }
      return context;
    }
  }
};

export const ExportPlugin = {
  name: 'export',
  version: '1.0.0',
  config: {
    formats: ['json', 'csv', 'xml'],
    includeMetrics: true
  },
  hooks: {
    'after-crawl': async (context) => {
      // Export in multiple formats
      for (const format of this.config.formats) {
        context.exports = context.exports || {};
        context.exports[format] = `Data in ${format.toUpperCase()} format`;
      }
      return context;
    }
  }
};

export default { PluginManager, MetricsPlugin, FilterPlugin, CachePlugin, ErrorRecoveryPlugin, NotificationPlugin, ExportPlugin };
