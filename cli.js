#!/usr/bin/env node

import CLIInterface from './src-cli-interface.js';
import { ConfigManager } from './src-config-manager.js';
import { ZygorScarper } from './orchestrator.js';

async function main() {
  try {
    const cli = new CLIInterface();
    cli.showBanner();

    const parsed = cli.parse();

    // Handle command
    if (parsed.command) {
      const cmd = cli.commands.get(parsed.command);
      if (cmd) {
        await cmd.handler(parsed.args || []);
      }
      return;
    }

    // Load configuration
    const config = new ConfigManager(parsed.cliArgs || {});
    
    if (!config.config.target) {
      cli.error('No target URL specified');
      cli.handleHelp([]);
      process.exit(1);
    }

    config.printSummary();

    // Start scraping
    const spinner = cli.showSpinner('Initializing scraper...');
    const scraper = new ZygorScarper(config.config);
    clearInterval(spinner);
    cli.clearLine();

    cli.success('Scraper initialized');
    cli.info(`Starting crawl of ${config.config.target}`);

    const manifest = await scraper.run(config.config.target, config.config.maxPages);

    cli.success(`Completed! Downloaded ${manifest.stats.pages} pages and ${manifest.stats.assets} assets`);
    cli.info(`Output directory: ${manifest.mirrorPath}`);

  } catch (error) {
    const cli = new CLIInterface();
    cli.error(error.message);
    if (process.env.DEBUG) {
      console.error(error.stack);
    }
    process.exit(1);
  }
}

main();
