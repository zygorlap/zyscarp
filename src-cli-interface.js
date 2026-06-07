import { ConfigManager, PRESETS } from './src-config-manager.js';

export class CLIInterface {
  constructor() {
    this.commands = new Map();
    this.args = process.argv.slice(2);
    this.registerDefaultCommands();
  }

  registerDefaultCommands() {
    this.register('help', this.handleHelp.bind(this), 'Show help message');
    this.register('version', this.handleVersion.bind(this), 'Show version');
    this.register('presets', this.handlePresets.bind(this), 'List available presets');
    this.register('config', this.handleConfig.bind(this), 'Show configuration');
    this.register('create-config', this.handleCreateConfig.bind(this), 'Create .zygorrc template');
  }

  register(name, handler, description = '') {
    this.commands.set(name, { handler, description });
  }

  parse() {
    if (this.args.length === 0) {
      return this.parseAsJob();
    }

    const [command] = this.args;
    
    if (this.commands.has(command)) {
      return { command, args: this.args.slice(1) };
    }

    return this.parseAsJob();
  }

  parseAsJob() {
    const cliArgs = this.argsToDictionary(this.args);
    return { type: 'job', cliArgs };
  }

  argsToDictionary(args) {
    const dict = {};
    for (let i = 0; i < args.length; i++) {
      const arg = args[i];
      if (arg.startsWith('--')) {
        const [key, value] = arg.substring(2).split('=');
        dict[`--${key}`] = value || (i + 1 < args.length && !args[i + 1].startsWith('--') ? args[++i] : true);
      }
    }
    return dict;
  }

  async execute() {
    const parsed = this.parse();

    if (parsed.type === 'job') {
      return parsed.cliArgs;
    }

    if (parsed.command && this.commands.has(parsed.command)) {
      const cmd = this.commands.get(parsed.command);
      return await cmd.handler(parsed.args);
    }

    this.showBanner();
    this.handleHelp([]);
    process.exit(1);
  }

  handleHelp(args) {
    this.showBanner();
    console.log('\n📖 USAGE\n');
    console.log('  zygor [command] [options]\n');

    console.log('⚙️  COMMANDS\n');
    for (const [name, cmd] of this.commands.entries()) {
      console.log(`  ${name.padEnd(20)} ${cmd.description}`);
    }

    console.log('\n🎯 OPTIONS\n');
    const options = [
      ['--target <url>', 'Target website URL'],
      ['--mode <mode>', 'Speed mode: light|fast|complete|aggressive|nuclear'],
      ['--preset <name>', 'Use preset: stealth|gentle|aggressive|performance'],
      ['--max-pages <n>', 'Maximum pages to crawl'],
      ['--concurrent <n>', 'Concurrent connections'],
      ['--output <dir>', 'Output directory'],
      ['--log-level <level>', 'Log level: trace|debug|info|warn|error|fatal'],
      ['--timeout <ms>', 'Request timeout in milliseconds'],
      ['--delay <ms>', 'Delay between requests'],
      ['--proxy <url>', 'Proxy URL'],
      ['--retries <n>', 'Number of retries'],
      ['--no-download', 'Skip asset download'],
      ['--no-crawl', 'Skip page crawl'],
      ['--no-screenshots', 'Skip screenshots'],
      ['--enable-cache', 'Enable caching'],
      ['--enable-delta-sync', 'Enable differential sync']
    ];

    for (const [flag, desc] of options) {
      console.log(`  ${flag.padEnd(25)} ${desc}`);
    }

    console.log('\n📝 EXAMPLES\n');
    console.log('  # Fast crawl with default settings');
    console.log('  zygor --target https://example.com\n');
    console.log('  # Aggressive crawl with stealth preset');
    console.log('  zygor --target https://example.com --preset stealth\n');
    console.log('  # Custom configuration');
    console.log('  zygor --target https://example.com --mode complete --concurrent 32\n');
    console.log('  # Show help');
    console.log('  zygor help\n');
    console.log('  # List presets');
    console.log('  zygor presets\n');
  }

  handleVersion(args) {
    console.log('Zygor Scarper v3.2.0 (Enterprise Edition)');
    process.exit(0);
  }

  handlePresets(args) {
    this.showBanner();
    console.log('\n🎨 AVAILABLE PRESETS\n');

    for (const [name, config] of Object.entries(PRESETS)) {
      console.log(`📌 ${name.toUpperCase()}`);
      console.log(`   Mode: ${config.mode}`);
      console.log(`   Concurrent: ${config.concurrent}`);
      console.log(`   Rate Limit: ${config.rateLimit}ms`);
      console.log(`   User-Agent Rotation: ${config.userAgentRotation}`);
      console.log(`   Respect robots.txt: ${config.respectRobotsTxt}`);
      console.log();
    }
  }

  handleConfig(args) {
    try {
      const config = new ConfigManager();
      console.log('\n📋 CURRENT CONFIGURATION\n');
      console.log(config.toJSON());
    } catch (e) {
      console.error(`Error: ${e.message}`);
      process.exit(1);
    }
  }

  handleCreateConfig(args) {
    const template = `{
  "target": "https://example.com",
  "mode": "fast",
  "maxPages": 500,
  "concurrent": 16,
  "outputDir": "./output",
  "logLevel": "info",
  "preset": "gentle",
  "enableMetrics": true,
  "enableDownload": true,
  "enableCrawl": true,
  "respectRobotsTxt": true,
  "userAgentRotation": true,
  "exportFormats": ["json"]
}`;

    const fs = await import('fs');
    fs.writeFileSync('.zygorrc.json', template);
    console.log('✅ Created .zygorrc.json template');
    process.exit(0);
  }

  showBanner() {
    console.log('\n' + '═'.repeat(70));
    console.log('  🔥 ZYGOR SCARPER - Enterprise Website Mirror & Intelligence Suite');
    console.log('  v3.2.0 | @zygorlap | instagram:@zygorlap');
    console.log('═'.repeat(70));
  }

  showTable(data, columns) {
    if (!data || data.length === 0) return;

    // Calculate column widths
    const widths = {};
    for (const col of columns) {
      widths[col] = col.length;
      for (const row of data) {
        const val = String(row[col] || '');
        widths[col] = Math.max(widths[col], val.length);
      }
    }

    // Header
    let header = '';
    for (const col of columns) {
      header += col.padEnd(widths[col] + 2);
    }
    console.log(header);
    console.log('─'.repeat(header.length));

    // Rows
    for (const row of data) {
      let line = '';
      for (const col of columns) {
        const val = String(row[col] || '');
        line += val.padEnd(widths[col] + 2);
      }
      console.log(line);
    }
    console.log();
  }

  showProgress(current, total, label = '', barLength = 40) {
    const percentage = (current / total) * 100;
    const filledLength = Math.round((barLength * current) / total);
    const bar = '█'.repeat(filledLength) + '░'.repeat(barLength - filledLength);
    const eta = Math.round((100 - percentage) / 2); // Rough estimate

    process.stdout.write(
      `\r${label.padEnd(15)} [${bar}] ${percentage.toFixed(1)}% (${current}/${total}) ETA: ${eta}s`
    );
  }

  showSpinner(message) {
    const frames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
    let frame = 0;

    return setInterval(() => {
      process.stdout.write(`\r${frames[frame]} ${message}`);
      frame = (frame + 1) % frames.length;
    }, 80);
  }

  clearLine() {
    process.stdout.write('\r' + ' '.repeat(80) + '\r');
  }

  success(message) {
    console.log(`✅ ${message}`);
  }

  warning(message) {
    console.log(`⚠️  ${message}`);
  }

  error(message) {
    console.error(`❌ ${message}`);
  }

  info(message) {
    console.log(`ℹ️  ${message}`);
  }
}

export default CLIInterface;
