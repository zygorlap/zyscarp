import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Default presets for different use cases
export const PRESETS = {
  stealth: {
    mode: 'light',
    concurrent: 8,
    delay: 500,
    retries: 8,
    userAgentRotation: true,
    respectRobotsTxt: true,
    rateLimit: 2000,
    proxy: null,
    timeout: 30000,
    screenshot: false
  },
  
  gentle: {
    mode: 'fast',
    concurrent: 12,
    delay: 300,
    retries: 6,
    userAgentRotation: true,
    respectRobotsTxt: true,
    rateLimit: 1500,
    proxy: null,
    timeout: 25000,
    screenshot: true
  },
  
  aggressive: {
    mode: 'aggressive',
    concurrent: 32,
    delay: 100,
    retries: 5,
    userAgentRotation: false,
    respectRobotsTxt: false,
    rateLimit: 500,
    proxy: null,
    timeout: 20000,
    screenshot: false
  },
  
  performance: {
    mode: 'complete',
    concurrent: 48,
    delay: 50,
    retries: 4,
    userAgentRotation: false,
    respectRobotsTxt: false,
    rateLimit: 100,
    proxy: null,
    timeout: 15000,
    screenshot: false,
    compression: true,
    caching: true,
    deltaSync: true
  }
};

export const DEFAULT_CONFIG = {
  // Core settings
  target: '',
  mode: 'fast',
  maxPages: 500,
  concurrent: 16,
  outputDir: './output',
  
  // Timing
  delay: 200,
  timeout: 20000,
  rateLimit: 1000,
  
  // Features
  enableDownload: true,
  enableCrawl: true,
  enableApiScraping: true,
  enableSecretExtraction: false,
  enableErrorBypass: true,
  enableScreenshots: true,
  enableZip: true,
  enableIntel: true,
  enableMetrics: true,
  
  // Advanced options
  respectRobotsTxt: true,
  userAgentRotation: true,
  proxy: null,
  retries: 5,
  
  // Caching & Performance
  caching: false,
  deltaSync: false,
  compression: false,
  
  // Logging
  logLevel: 'info',
  logFile: null,
  logFormat: 'json',
  
  // Database (optional)
  database: null,
  
  // Export
  exportFormats: ['json'],
  
  // Webhook
  webhookUrl: null,
  
  // Scheduling
  schedule: null
};

export class ConfigManager {
  constructor(cliArgs = {}) {
    this.config = { ...DEFAULT_CONFIG };
    this.preset = null;
    this.configFile = null;
    this.cliArgs = cliArgs;
    
    this.load();
  }

  load() {
    // 1. Load from .zygorrc file if exists
    const rcPath = this.findConfigFile();
    if (rcPath) {
      this.loadFromFile(rcPath);
      this.configFile = rcPath;
    }

    // 2. Load preset if specified
    if (this.cliArgs.preset || this.config.preset) {
      const presetName = this.cliArgs.preset || this.config.preset;
      if (PRESETS[presetName]) {
        this.applyPreset(presetName);
      }
    }

    // 3. Override with CLI arguments
    this.applyCliArgs();

    // 4. Override with environment variables
    this.applyEnvOverrides();

    // Validate configuration
    this.validate();
  }

  findConfigFile() {
    const locations = [
      path.join(process.cwd(), '.zygorrc'),
      path.join(process.cwd(), '.zygorrc.json'),
      path.join(process.cwd(), 'zygor.config.js'),
      path.join(process.cwd(), 'zygor.config.json'),
      path.join(process.env.HOME || process.env.USERPROFILE, '.zygorrc')
    ];

    for (const loc of locations) {
      if (fs.existsSync(loc)) {
        return loc;
      }
    }
    return null;
  }

  loadFromFile(filePath) {
    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      let data;

      if (filePath.endsWith('.js')) {
        // Dynamic import for .js config
        const module = await import(filePath);
        data = module.default || module;
      } else {
        // JSON parsing
        data = JSON.parse(content);
      }

      Object.assign(this.config, data);
      return true;
    } catch (e) {
      console.warn(`Warning: Failed to load config from ${filePath}: ${e.message}`);
      return false;
    }
  }

  applyPreset(presetName) {
    if (PRESETS[presetName]) {
      Object.assign(this.config, PRESETS[presetName]);
      this.preset = presetName;
      return true;
    }
    console.warn(`Warning: Unknown preset "${presetName}". Available: ${Object.keys(PRESETS).join(', ')}`);
    return false;
  }

  applyCliArgs() {
    const argMap = {
      '--target': 'target',
      '--mode': 'mode',
      '--max-pages': 'maxPages',
      '--concurrent': 'concurrent',
      '--output': 'outputDir',
      '--delay': 'delay',
      '--timeout': 'timeout',
      '--log-level': 'logLevel',
      '--preset': 'preset',
      '--proxy': 'proxy',
      '--retries': 'retries'
    };

    for (const [flag, key] of Object.entries(argMap)) {
      if (this.cliArgs[flag]) {
        const value = this.cliArgs[flag];
        if (key.includes('Pages') || key.includes('concurrent') || key.includes('Limit') || key === 'retries') {
          this.config[key] = parseInt(value, 10);
        } else {
          this.config[key] = value;
        }
      }
    }

    // Boolean flags
    const boolFlags = [
      '--no-download',
      '--no-crawl',
      '--no-api-scraping',
      '--no-screenshots',
      '--no-zip',
      '--enable-cache',
      '--enable-delta-sync',
      '--disable-robots-txt'
    ];

    for (const flag of boolFlags) {
      if (this.cliArgs[flag]) {
        const key = this.flagToConfigKey(flag);
        this.config[key] = !flag.startsWith('--no-');
      }
    }
  }

  flagToConfigKey(flag) {
    return flag
      .replace(/^--/, '')
      .replace(/^(no-)/, '')
      .replace(/-([a-z])/g, (g) => g[1].toUpperCase())
      .replace(/^./, (c) => `enable${c.toUpperCase()}`)
      .replace(/enable(enable)?/, 'enable');
  }

  applyEnvOverrides() {
    const envMap = {
      'ZYGOR_TARGET': 'target',
      'ZYGOR_MODE': 'mode',
      'ZYGOR_MAX_PAGES': 'maxPages',
      'ZYGOR_CONCURRENT': 'concurrent',
      'ZYGOR_OUTPUT': 'outputDir',
      'ZYGOR_LOG_LEVEL': 'logLevel',
      'ZYGOR_PRESET': 'preset',
      'ZYGOR_PROXY': 'proxy',
      'ZYGOR_TIMEOUT': 'timeout',
      'ZYGOR_DELAY': 'delay'
    };

    for (const [envVar, key] of Object.entries(envMap)) {
      const value = process.env[envVar];
      if (value !== undefined) {
        if (['maxPages', 'concurrent', 'timeout', 'delay', 'retries'].includes(key)) {
          this.config[key] = parseInt(value, 10);
        } else {
          this.config[key] = value;
        }
      }
    }
  }

  validate() {
    if (!this.config.target && !this.config.defaultTarget) {
      throw new Error('No target URL specified. Use --target, config file, or ZYGOR_TARGET env var');
    }

    if (this.config.concurrent > 64) {
      console.warn('Warning: Concurrent connections > 64 may cause issues. Limiting to 64.');
      this.config.concurrent = 64;
    }

    if (this.config.maxPages < 1) {
      this.config.maxPages = 1;
    }

    if (!['light', 'fast', 'complete', 'aggressive', 'nuclear'].includes(this.config.mode)) {
      console.warn(`Warning: Unknown mode "${this.config.mode}". Defaulting to "fast".`);
      this.config.mode = 'fast';
    }
  }

  get(key, defaultValue = undefined) {
    return this.config[key] !== undefined ? this.config[key] : defaultValue;
  }

  set(key, value) {
    this.config[key] = value;
  }

  getAll() {
    return { ...this.config };
  }

  toJSON() {
    return JSON.stringify(this.config, null, 2);
  }

  saveToFile(filePath) {
    fs.writeFileSync(filePath, this.toJSON());
  }

  printSummary() {
    console.log('\n📋 Configuration Summary:');
    console.log('─'.repeat(50));
    console.log(`Target         : ${this.config.target}`);
    console.log(`Mode           : ${this.config.mode}`);
    console.log(`Preset         : ${this.preset || 'custom'}`);
    console.log(`Max Pages      : ${this.config.maxPages}`);
    console.log(`Concurrency    : ${this.config.concurrent}`);
    console.log(`Output Dir     : ${this.config.outputDir}`);
    console.log(`Log Level      : ${this.config.logLevel}`);
    console.log('─'.repeat(50) + '\n');
  }
}

export default ConfigManager;
