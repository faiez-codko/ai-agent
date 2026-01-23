#!/usr/bin/env node
import 'dotenv/config';
import { Command } from 'commander';
import { setup, read, update, fix, run, web } from './src/commands.js';
import { startInteractiveMode } from './src/interactive.js';
import chalk from 'chalk';
import path from 'path';
import fs from 'fs';

const AGENT_DIR = path.join(process.cwd(), '.agent');
if (!fs.existsSync(AGENT_DIR)) {
  fs.mkdirSync(AGENT_DIR);
}



const program = new Command();

// Check if run without arguments
if (process.argv.length <= 2) {
  startInteractiveMode().catch(err => {
    console.error(chalk.red('Fatal Error:'), err);
    process.exit(1);
  });
} else {
  program
    .name('agent')
    .description('AI CLI Agent for managing client projects')
    .version('1.0.0');

  program
    .command('setup')
    .description('Configure AI provider and settings')
    .action(setup);

  program
    .command('read <file> [query]')
    .description('Read and analyze a file')
    .action(read);

  program
    .command('update <file> [instruction...]')
    .description('Update a file based on instructions')
    .action(async (file, instructionParts) => {
      const instruction = instructionParts ? instructionParts.join(' ') : undefined;
      await update(file, instruction);
    });

  program
    .command('fix <file>')
    .description('Attempt to fix errors in a file')
    .action(fix);

  program
    .command('run <instruction...>')
    .description('Run a shell command generated from instruction')
    .action(async (instructionParts) => {
      const instruction = instructionParts.join(' ');
      await run(instruction);
    });

  program
    .command('web')
    .description('Start the web interface')
    .action(web);

  program.parse();
}
