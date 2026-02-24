#!/usr/bin/env node
import 'dotenv/config';
import { Command } from 'commander';
import { setup, setupSheets, read, update, fix, run, web, integrationList, integrationSetup, mcpList, mcpInstall, mcpEnable, mcpDisable, mcpRemove, call, skillsAdd, skillsList, sessionsList, sessionsExport } from './src/commands.js';
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

  const setupCmd = program
    .command('setup')
    .description('Configure AI provider and settings')
    .action(setup);

  setupCmd
    .command('sheets')
    .description('Configure Google Sheets service account')
    .option('--file <path>', 'Path to service account JSON file')
    .action(setupSheets);

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

  program
    .command('call <target>')
    .description('Call a tool, MCP tool, or another agent')
    .option('--payload <json>', 'JSON payload for the call')
    .action(call);

  const integration = program.command('integration').description('Manage integrations');

  integration
    .command('list')
    .description('List available integrations')
    .action(integrationList);

  integration
    .command('setup <name>')
    .description('Setup a specific integration')
    .action(integrationSetup);

  const mcp = program.command('mcp').description('Manage MCP servers');

  mcp
    .command('list')
    .description('List installed MCP servers')
    .action(mcpList);

  mcp
    .command('install <name> <command>')
    .description('Install an MCP server')
    .option('--args <args>', 'JSON array or space-separated args')
    .option('--env <env>', 'JSON object of environment variables')
    .option('--disabled', 'Install server disabled')
    .action(mcpInstall);

  mcp
    .command('enable <name>')
    .description('Enable an MCP server')
    .action(mcpEnable);

  mcp
    .command('disable <name>')
    .description('Disable an MCP server')
    .action(mcpDisable);

  mcp
    .command('remove <name>')
    .description('Remove an MCP server')
    .action(mcpRemove);

  const skills = program.command('skills').description('Manage Agent Skills');

  skills
    .command('add <url>')
    .description('Add a skill from a URL')
    .option('--skill <name>', 'Name of the skill to create')
    .action(skillsAdd);

  skills
    .command('list')
    .description('List available skills')
    .action(skillsList);

  const sessions = program.command('sessions').description('Manage chat sessions');

  sessions
    .command('list')
    .description('List recent sessions')
    .option('--limit <number>', 'Number of sessions to list', '10')
    .action(sessionsList);

  sessions
    .command('export <sessionId>')
    .description('Export a session to JSON or CSV')
    .option('--format <format>', 'Output format (json, csv)', 'json')
    .option('--out <file>', 'Output file path')
    .action(sessionsExport);

  program.parse();
}
