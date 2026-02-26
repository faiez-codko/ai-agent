import inquirer from 'inquirer';
import chalk from 'chalk';
import ora from 'ora';
import { saveConfig, loadConfig } from './config.js';
import { Agent } from './agent.js';
import { AgentManager } from './agentManager.js';
import { writeFile, readFile } from './tools/fs.js';
import { runCommand } from './tools/shell.js';
import * as Diff from 'diff';
import { webUiTools } from './tools/web_ui.js';
import { tools, toolDefinitions } from './tools/index.js';
import { routeToolCall } from './tools/router.js';
import { listIntegrations as listInt, setupIntegration as setupInt } from './integrations/index.js';
import { installMcpServer, listMcpServers, removeMcpServer, setMcpServerEnabled } from './mcp/index.js';
import { addSkillFromUrl, listPersonas } from './personas/index.js';
import { listSessions, getSession } from './chatStorage.js';
import { parse } from 'json2csv';
import path from 'path';
import fsp from 'fs/promises';
import os from 'os';
import { SheetsService } from './tools/sheets.js';

export async function setupSheets(options) {
    try {
        const file = options.file;
        if (!file) {
            console.error(chalk.red('Error: --file <oauth.client.json> is required.'));
            process.exit(1);
        }
        const resolved = path.isAbsolute(file) ? file : path.join(process.cwd(), file);
        try {
            const stat = await fsp.stat(resolved);
            if (!stat.isFile()) throw new Error('Not a file');
        } catch {
            console.error(chalk.red(`OAuth client file not found: ${resolved}`));
            process.exit(1);
        }
        
        const config = await loadConfig();
        config.google_sheets = { oauthClientFile: resolved };
        await saveConfig(config);
        
        console.log(chalk.blue('Initiating Google Sheets authentication...'));
        
        // Token path in user's home directory
        const tokenPath = path.join(os.homedir(), '.oauth.token.json');
        
        // Instantiate and initialize service to trigger auth flow
        const service = new SheetsService({ 
            oauthClientPath: resolved,
            tokenPath 
        });
        
        await service.init();
        
        console.log(chalk.green(`Google Sheets configured successfully!`));
        console.log(chalk.green(`- Client file: ${resolved}`));
        console.log(chalk.green(`- Token file: ${tokenPath}`));
        
    } catch (error) {
        console.error(chalk.red(`Failed to configure Google Sheets: ${error.message}`));
        process.exit(1);
    }
}

export async function sessionsList(options) {
    try {
        const limit = parseInt(options.limit) || 10;
        const sessions = await listSessions(limit);
        
        if (sessions.length === 0) {
            console.log(chalk.yellow('No sessions found.'));
            return;
        }

        console.log(chalk.bold(`\nRecent Sessions (Last ${limit}):`));
        console.log(chalk.gray('ID | Date | Messages | First Message'));
        console.log(chalk.gray('---|------|----------|--------------'));

        sessions.forEach(s => {
            const date = new Date(s.created_at).toLocaleString();
            const msg = s.first_message ? (s.first_message.substring(0, 50) + (s.first_message.length > 50 ? '...' : '')) : '(No messages)';
            console.log(`${chalk.cyan(s.id)} | ${date} | ${s.message_count} | ${msg}`);
        });
        console.log('');
    } catch (error) {
        console.error(chalk.red(`Failed to list sessions: ${error.message}`));
    }
}

export async function sessionsExport(sessionId, options) {
    try {
        const session = await getSession(sessionId);
        if (!session) {
            console.error(chalk.red(`Session ${sessionId} not found.`));
            process.exit(1);
        }

        let outputData = '';
        const format = options.format.toLowerCase();

        if (format === 'json') {
            outputData = JSON.stringify(session, null, 2);
        } else if (format === 'csv') {
            // Flatten for CSV
            const flatMessages = session.messages.map(m => ({
                session_id: session.id,
                agent_id: session.agent_id,
                session_created_at: session.created_at,
                message_id: m.id,
                role: m.role,
                content: m.content,
                tool_calls: m.tool_calls,
                tool_call_id: m.tool_call_id,
                name: m.name,
                message_created_at: m.created_at
            }));
            
            if (flatMessages.length === 0) {
                 // Create a dummy row with session info if no messages
                 flatMessages.push({
                    session_id: session.id,
                    agent_id: session.agent_id,
                    session_created_at: session.created_at,
                    message_id: '', role: '', content: '', tool_calls: '', tool_call_id: '', name: '', message_created_at: ''
                 });
            }

            try {
                outputData = parse(flatMessages);
            } catch (err) {
                 throw new Error(`CSV conversion failed: ${err.message}`);
            }
        } else {
            console.error(chalk.red(`Unsupported format: ${format}. Use 'json' or 'csv'.`));
            process.exit(1);
        }

        if (options.out) {
            await writeFile(options.out, outputData);
            console.log(chalk.green(`Session ${sessionId} exported to ${options.out}`));
        } else {
            console.log(outputData);
        }

    } catch (error) {
        console.error(chalk.red(`Failed to export session: ${error.message}`));
        process.exit(1);
    }
}

export async function skillsAdd(url, options) {
    if (!options.skill) {
        console.error(chalk.red('Error: --skill <name> is required.'));
        process.exit(1);
    }
    
    try {
        const result = await addSkillFromUrl(url, options.skill);
        console.log(chalk.green(`\n✓ Skill '${result.id}' added successfully! (${result.size} bytes)`));
    } catch (error) {
        console.error(chalk.red(`\n✗ Failed to add skill: ${error.message}`));
        process.exit(1);
    }
}

export async function skillsList() {
    try {
        const skills = await listPersonas();
        if (skills.length === 0) {
            console.log(chalk.yellow('No skills found.'));
        } else {
            console.log(chalk.bold('\nAvailable Skills:'));
            skills.forEach(skill => {
                console.log(`- ${chalk.cyan(skill.id)}`);
            });
        }
    } catch (error) {
        console.error(chalk.red(`Failed to list skills: ${error.message}`));
    }
}

export async function web() {
  const spinner = ora('Starting web interface...').start();
  try {
    const message = await webUiTools.start_chat_ui();
    spinner.succeed(message);
    console.log(chalk.cyan('Press Ctrl+C to stop the server.'));
  } catch (error) {
    spinner.fail('Failed to start web interface');
    console.error(chalk.red(error));
    process.exit(1);
  }
}

export async function setup() {
  let config = await loadConfig();
  
  console.log(chalk.blue.bold('\n--- AI Agent Setup ---\n'));

  while (true) {
    console.log(chalk.grey.bold('1. AI Provider'));
    console.log(chalk.grey.bold('2. SMS Gateway (sms-gate.app)'));
    console.log(chalk.grey.bold('3. Telegram Integration'));
    console.log(chalk.grey.bold('4. GitHub Integration'));
    console.log(chalk.grey.bold('5. Email Integration (Gmail/SMTP)'));
    console.log(chalk.grey.bold('6. Audio Configuration'));
    console.log(chalk.grey.bold('7. WhatsApp Configuration'));
    console.log(chalk.grey.bold('8. Browser Configuration'));
    console.log(chalk.grey.bold('9. Exit'));
    const { action } = await inquirer.prompt([
      {
        type: 'list',
        name: 'action',
        message: 'What would you like to configure?',
        choices: [
          { name: '1. AI Provider', value: '1' },
          { name: '2. SMS Gateway (sms-gate.app)', value: '2' },
          { name: '3. Telegram Integration', value: '3' },
          { name: '4. GitHub Integration', value: '4' },
          { name: '5. Email Integration (Gmail/SMTP)', value: '5' },
          { name: '6. Audio Configuration', value: '6' },
          { name: '7. WhatsApp Configuration', value: '7' },
          { name: '8. Browser Configuration', value: '8' },
          { name: 'Exit', value: '9' }
        ]
      }
    ]);

    if (action === '9') {
      console.log(chalk.green('Setup completed.'));
      break;
    }

    if (action === '1') {
      const providerAnswers = await inquirer.prompt([
        {
          type: 'list',
          name: 'provider',
          message: 'Select AI Provider:',
          choices: ['openai', 'gemini', 'compatible'],
          default: config.provider,
        },
        {
          type: 'input',
          name: 'model',
          message: 'Enter Model Name (optional):',
          default: (answers) => {
            if (answers.provider === 'openai') return 'gpt-4o';
            if (answers.provider === 'gemini') return 'gemini-1.5-flash';
            return 'gpt-3.5-turbo';
          },
        },
        {
          type: 'password',
          name: 'apiKey',
          message: 'Enter API Key:',
          mask: '*',
        },
        {
          type: 'input',
          name: 'baseUrl',
          message: 'Enter Base URL:',
          default: 'http://localhost:8080/v1',
          when: (answers) => answers.provider === 'compatible',
        }
      ]);

      config.provider = providerAnswers.provider;
      config.model = providerAnswers.model;
      
      if (providerAnswers.provider === 'openai') {
          config.openai_api_key = providerAnswers.apiKey;
      } else if (providerAnswers.provider === 'gemini') {
          config.gemini_api_key = providerAnswers.apiKey;
      } else if (providerAnswers.provider === 'compatible') {
          config.compatible_api_key = providerAnswers.apiKey;
          config.compatible_base_url = providerAnswers.baseUrl;
      }
      
      await saveConfig(config);
      console.log(chalk.green('AI Provider configuration saved!\n'));

    } else if (action === '2') {
      const smsAnswers = await inquirer.prompt([
        {
            type: 'input',
            name: 'sms_username',
            message: 'Enter SMS Gateway Username (leave empty to skip):',
            default: config.sms_username || '',
        },
        {
            type: 'password',
            name: 'sms_password',
            message: 'Enter SMS Gateway Password (leave empty to skip):',
            mask: '*',
            default: config.sms_password || '',
            when: (answers) => answers.sms_username
        },
        {
            type: 'input',
            name: 'sms_device_id',
            message: 'Enter Default Device ID (optional):',
            default: config.sms_device_id || '',
            when: (answers) => answers.sms_username
        }
      ]);

      if (smsAnswers.sms_username !== undefined) config.sms_username = smsAnswers.sms_username;
      if (smsAnswers.sms_password !== undefined) config.sms_password = smsAnswers.sms_password;
      if (smsAnswers.sms_device_id !== undefined) config.sms_device_id = smsAnswers.sms_device_id;
      
      await saveConfig(config);
      console.log(chalk.green('SMS Gateway configuration saved!\n'));

    } else if (action === '3') {
      const telegramAnswers = await inquirer.prompt([
        {
            type: 'password',
            name: 'telegram_bot_token',
            message: 'Enter Telegram Bot Token (leave empty to skip):',
            mask: '*',
            default: config.telegram_bot_token || '',
        }
      ]);

      if (telegramAnswers.telegram_bot_token !== undefined) config.telegram_bot_token = telegramAnswers.telegram_bot_token;
      
      await saveConfig(config);
      console.log(chalk.green('Telegram configuration saved!\n'));

    } else if (action === '4') {
      const githubAnswers = await inquirer.prompt([
        {
            type: 'password',
            name: 'github_token',
            message: 'Enter GitHub Token (leave empty to skip):',
            mask: '*',
            default: config.github_token || '',
        }
      ]);

      if (githubAnswers.github_token !== undefined) config.github_token = githubAnswers.github_token;
      
      await saveConfig(config);
      console.log(chalk.green('GitHub configuration saved!\n'));

    } else if (action === '5') {
        const emailAnswers = await inquirer.prompt([
            {
                type: 'list',
                name: 'provider',
                message: 'Select Email Provider:',
                choices: ['Gmail', 'Custom SMTP/IMAP'],
                default: config.email?.provider || 'Gmail'
            },
            {
                type: 'input',
                name: 'user',
                message: 'Email Address:',
                default: config.email?.user || '',
                validate: input => input.includes('@') ? true : 'Invalid email'
            },
            {
                type: 'password',
                name: 'password',
                message: 'Password (or App Password):',
                mask: '*',
                default: config.email?.password || '',
                validate: input => input.length > 0 ? true : 'Password is required'
            }
        ]);

        let emailConfig = {
            user: emailAnswers.user,
            password: emailAnswers.password,
            provider: emailAnswers.provider
        };

        if (emailAnswers.provider === 'Custom SMTP/IMAP') {
            const customAnswers = await inquirer.prompt([
                { type: 'input', name: 'host', message: 'IMAP Host:', default: config.email?.host || '' },
                { type: 'number', name: 'port', message: 'IMAP Port:', default: config.email?.port || 993 },
                { type: 'confirm', name: 'tls', message: 'Use TLS?', default: config.email?.tls !== false },
                { type: 'input', name: 'smtpHost', message: 'SMTP Host:', default: config.email?.smtpHost || '' },
                { type: 'number', name: 'smtpPort', message: 'SMTP Port:', default: config.email?.smtpPort || 587 }
            ]);
            Object.assign(emailConfig, customAnswers);
        } else {
            // Gmail Defaults
            emailConfig.host = 'imap.gmail.com';
            emailConfig.port = 993;
            emailConfig.tls = true;
            emailConfig.smtpHost = 'smtp.gmail.com';
            emailConfig.smtpPort = 587;
        }

        config.email = emailConfig;
        await saveConfig(config);
        console.log(chalk.green('Email configuration saved!\n'));
    }

    if (action === '6') {
      const audioAnswers = await inquirer.prompt([
        {
          type: 'confirm',
          name: 'audio_enabled',
          message: 'Enable Audio Responses (TTS)?',
          default: config.audio_enabled || false,
        },
        {
          type: 'list',
          name: 'audio_voice',
          message: 'Select Voice:',
          choices: ['alloy', 'echo', 'fable', 'onyx', 'nova', 'shimmer'],
          default: config.audio_voice || 'alloy',
          when: (answers) => answers.audio_enabled,
        }
      ]);

      config.audio_enabled = audioAnswers.audio_enabled;
      if (audioAnswers.audio_enabled) {
          config.audio_voice = audioAnswers.audio_voice;
      }
      await saveConfig(config);
      console.log(chalk.green('Audio configuration saved!'));
    }

    if (action === '7') {
        const waAnswers = await inquirer.prompt([
            {
                type: 'input',
                name: 'trigger',
                message: 'Enter custom trigger (leave empty for "@ai", type "none" for all messages):',
                default: config.whatsapp_trigger || '@ai'
            },
            {
                type: 'input',
                name: 'excluded',
                message: 'Enter numbers (e.g. 1234567890) or exact Group Names to exclude (comma separated):',
                default: config.whatsapp_excluded || ''
            },
            {
                type: 'confirm',
                name: 'groupsEnabled',
                message: 'Enable AI in WhatsApp Groups?',
                default: config.whatsapp_groups_enabled !== false // Default to true
            },
            {
                type: 'confirm',
                name: 'updatePrompt',
                message: 'Do you want to update the custom System Prompt?',
                default: false
            },
            {
                type: 'editor',
                name: 'systemPrompt',
                message: 'Enter custom System Prompt for WhatsApp Agent:',
                default: config.whatsapp_system_prompt || '',
                when: (answers) => answers.updatePrompt
            }
        ]);

        config.whatsapp_trigger = waAnswers.trigger;
        config.whatsapp_excluded = waAnswers.excluded;
        config.whatsapp_groups_enabled = waAnswers.groupsEnabled;
        if (waAnswers.updatePrompt) {
            config.whatsapp_system_prompt = waAnswers.systemPrompt;
        }
        
        await saveConfig(config);
        console.log(chalk.green('WhatsApp configuration saved!'));
    } else if (action === '8') {
        const browserAnswers = await inquirer.prompt([
            {
                type: 'list',
                name: 'searchEngine',
                message: 'Default browser search engine:',
                choices: ['duckduckgo', 'google', 'bing'],
                default: config.browser?.searchEngine || 'duckduckgo'
            },
            {
                type: 'confirm',
                name: 'headless',
                message: 'Run Puppeteer in headless mode?',
                default: config.browser?.headless ?? false
            },
            {
                type: 'confirm',
                name: 'browserlessEnabled',
                message: 'Use Browserless remote browser (for captcha-prone flows)?',
                default: config.browser?.browserless?.enabled ?? false
            },
            {
                type: 'input',
                name: 'browserlessEndpoint',
                message: 'Browserless WebSocket endpoint (without token query):',
                default: config.browser?.browserless?.endpoint || 'wss://production-sfo.browserless.io',
                when: (answers) => answers.browserlessEnabled
            },
            {
                type: 'password',
                name: 'browserlessToken',
                message: 'Browserless API token:',
                mask: '*',
                default: config.browser?.browserless?.token || '',
                when: (answers) => answers.browserlessEnabled
            },
            {
                type: 'input',
                name: 'proxyServer',
                message: 'Proxy server URL (optional, e.g. http://host:port or socks5://host:port):',
                default: config.browser?.proxy?.server || ''
            },
            {
                type: 'input',
                name: 'proxyUsername',
                message: 'Proxy username (optional):',
                default: config.browser?.proxy?.username || '',
                when: (answers) => !!answers.proxyServer
            },
            {
                type: 'password',
                name: 'proxyPassword',
                message: 'Proxy password (optional):',
                mask: '*',
                default: config.browser?.proxy?.password || '',
                when: (answers) => !!answers.proxyServer
            },
            {
                type: 'input',
                name: 'proxyBypass',
                message: 'Proxy bypass list (optional):',
                default: config.browser?.proxy?.bypass || '',
                when: (answers) => !!answers.proxyServer
            },
            {
                type: 'list',
                name: 'captchaMode',
                message: 'Captcha handling mode:',
                choices: ['manual', 'provider', 'none'],
                default: config.browser?.captcha?.mode || 'manual'
            },
            {
                type: 'input',
                name: 'captchaProvider',
                message: 'Captcha provider name (e.g. 2captcha, capsolver):',
                default: config.browser?.captcha?.provider || '',
                when: (answers) => answers.captchaMode === 'provider'
            },
            {
                type: 'password',
                name: 'captchaApiKey',
                message: 'Captcha provider API key:',
                mask: '*',
                default: config.browser?.captcha?.apiKey || '',
                when: (answers) => answers.captchaMode === 'provider'
            },
            {
                type: 'confirm',
                name: 'captchaAutoDetect',
                message: 'Enable captcha auto-detection?',
                default: config.browser?.captcha?.autoDetect ?? true
            }
        ]);

        config.browser = {
            ...(config.browser || {}),
            searchEngine: browserAnswers.searchEngine,
            headless: browserAnswers.headless,
            browserless: browserAnswers.browserlessEnabled ? {
                enabled: true,
                endpoint: browserAnswers.browserlessEndpoint || 'wss://production-sfo.browserless.io',
                token: browserAnswers.browserlessToken || null
            } : {
                enabled: false,
                endpoint: config.browser?.browserless?.endpoint || 'wss://production-sfo.browserless.io',
                token: null
            },
            proxy: browserAnswers.proxyServer ? {
                server: browserAnswers.proxyServer,
                username: browserAnswers.proxyUsername || '',
                password: browserAnswers.proxyPassword || '',
                bypass: browserAnswers.proxyBypass || ''
            } : null,
            captcha: {
                mode: browserAnswers.captchaMode,
                provider: browserAnswers.captchaProvider || null,
                apiKey: browserAnswers.captchaApiKey || null,
                autoDetect: browserAnswers.captchaAutoDetect
            }
        };

        await saveConfig(config);
        console.log(chalk.green('Browser configuration saved!'));
    }
  }
}

export async function read(filePath, query, agentInstance = null) {
  const spinner = ora('Analyzing file...').start();
  try {
    const agent = agentInstance || new Agent(await loadConfig());
    if (!agentInstance) await agent.init();
    
    const result = await agent.analyzeFile(filePath, query);
    spinner.stop();
    console.log(chalk.blue.bold(`\nAnalysis of ${filePath}:\n`));
    console.log(result);
  } catch (error) {
    spinner.fail('Analysis failed');
    console.error(chalk.red(error.message));
  }
}

export async function update(filePath, instruction, agentInstance = null) {
  if (!instruction) {
      const answer = await inquirer.prompt([{
          type: 'input',
          name: 'instruction',
          message: 'What changes do you want to make?',
      }]);
      instruction = answer.instruction;
  }

  const spinner = ora('Updating file...').start();
  try {
    const agent = agentInstance || new Agent(await loadConfig());
    if (!agentInstance) await agent.init();
    
    // Read original content for simple diff or backup
    const originalContent = await readFile(filePath);
    
    const newContent = await agent.updateFile(filePath, instruction);
    
    // Show Diff
    const diff = Diff.diffLines(originalContent, newContent);
    console.log(chalk.bold('\nProposed Changes:\n'));
    diff.forEach((part) => {
      // green for additions, red for deletions
      // grey for common parts
      const color = part.added ? chalk.green :
        part.removed ? chalk.red : chalk.grey;
      process.stdout.write(color(part.value));
    });
    console.log('\n');

    // Confirm changes
    const confirm = await inquirer.prompt([{
        type: 'confirm',
        name: 'apply',
        message: 'Do you want to apply these changes?',
        default: true
    }]);

    if (confirm.apply) {
        await writeFile(filePath, newContent);
        spinner.succeed(chalk.green(`Successfully updated ${filePath}`));
    } else {
        spinner.info(chalk.yellow('Changes discarded.'));
    }
  } catch (error) {
    spinner.fail('Update failed');
    console.error(chalk.red(error.message));
  }
}

export async function fix(filePath, agentInstance = null) {
  const spinner = ora('Fixing file...').start();
  try {
    const agent = agentInstance || new Agent(await loadConfig());
    if (!agentInstance) await agent.init();
    
    // Read file
    const content = await readFile(filePath);
    
    // Ask AI to fix
    // We can reuse updateFile logic or create a specialized fix method
    // For now, let's use updateFile with a "fix" instruction
    const newContent = await agent.updateFile(filePath, "Fix any bugs, syntax errors, or logical issues in this code. Return the full fixed code.");
    
    // Show Diff (reusing update logic would be better but for now inline)
    const diff = Diff.diffLines(content, newContent);
    console.log(chalk.bold('\nProposed Fixes:\n'));
    diff.forEach((part) => {
      const color = part.added ? chalk.green :
        part.removed ? chalk.red : chalk.grey;
      process.stdout.write(color(part.value));
    });
    console.log('\n');

    const confirm = await inquirer.prompt([{
        type: 'confirm',
        name: 'apply',
        message: 'Do you want to apply these fixes?',
        default: true
    }]);

    if (confirm.apply) {
        await writeFile(filePath, newContent);
        spinner.succeed(chalk.green(`Successfully fixed ${filePath}`));
    } else {
        spinner.info(chalk.yellow('Fixes discarded.'));
    }

  } catch (error) {
    spinner.fail('Fix failed');
    console.error(chalk.red(error.message));
  }
}

export async function run(instruction, agentInstance = null) {
  const spinner = ora('Generating command...').start();
  try {
    const agent = agentInstance || new Agent(await loadConfig());
    if (!agentInstance) await agent.init();

    const command = await agent.generateCommand(instruction);
    spinner.stop();
    
    console.log(chalk.bold('Generated Command:'), chalk.cyan(command));
    
    const confirm = await inquirer.prompt([{
        type: 'confirm',
        name: 'run',
        message: 'Do you want to run this command?',
        default: false
    }]);

    if (confirm.run) {
        const { stdout, stderr } = await runCommand(command);
        if (stdout) console.log(stdout);
        if (stderr) console.error(chalk.red(stderr));
    } else {
        console.log(chalk.yellow('Command skipped.'));
    }

  } catch (error) {
    spinner.fail('Command generation failed');
    console.error(chalk.red(error.message));
  }
}

export function integrationList() {
    listInt();
}

export async function integrationSetup(name) {
    await setupInt(name);
}

const parseJsonOption = (value, fallback) => {
  if (!value) return fallback;
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
};

const parseArgsOption = (value) => {
  if (!value) return [];
  const parsed = parseJsonOption(value, []);
  if (Array.isArray(parsed)) return parsed;
  if (typeof parsed === 'string') return parsed.split(/\s+/).filter(Boolean);
  return [];
};

export async function mcpList() {
  const servers = await listMcpServers();
  const names = Object.keys(servers);
  if (!names.length) {
    console.log(chalk.yellow('No MCP servers installed.'));
    return;
  }
  console.log(chalk.bold('\nMCP Servers:\n'));
  names.forEach(name => {
    const server = servers[name];
    const status = server.enabled === false ? 'disabled' : 'enabled';
    console.log(`${chalk.green(name)} | ${status} | ${server.command}`);
  });
  console.log('');
}

export async function mcpInstall(name, command, options) {
  const args = parseArgsOption(options?.args);
  const env = parseJsonOption(options?.env, {});
  const enabled = !options?.disabled;
  await installMcpServer({ name, command, args, env, enabled });
  console.log(chalk.green(`MCP server '${name}' installed.`));
}

export async function mcpEnable(name) {
  await setMcpServerEnabled(name, true);
  console.log(chalk.green(`MCP server '${name}' enabled.`));
}

export async function mcpDisable(name) {
  await setMcpServerEnabled(name, false);
  console.log(chalk.yellow(`MCP server '${name}' disabled.`));
}

export async function mcpRemove(name) {
  await removeMcpServer(name);
  console.log(chalk.green(`MCP server '${name}' removed.`));
}

export async function call(target, options) {
  if (options?.payload?.startsWith('@')) {
    try {
      options.payload = await readFile(options.payload.slice(1));
    } catch (error) {
      console.error(chalk.red(`Failed to read payload file: ${options.payload.slice(1)}`));
      process.exit(1);
    }
  }

  let payload = parseJsonOption(options?.payload, {});

  // Handle case where payload is a string (parsing failed or string provided)
  // If it looks like JSON but parsing failed, it might be due to shell quoting issues
  if (typeof payload === 'string' && options?.payload) {
    try {
      // Sometimes quotes are stripped. If it starts with { and ends with }, try to fix it?
      // Or just warn the user.
      console.warn(chalk.yellow('Warning: Payload was not parsed as JSON. Received string:'), payload);
      console.warn(chalk.yellow('Ensure you are using correct quoting for your shell.'));
    } catch {}
  }

  const manager = new AgentManager();
  await manager.init();
  if (manager.agents.size === 0) {
    await manager.createAgent('default', 'primary');
  }
  const agent = manager.getActiveAgent();
  try {
    const result = await routeToolCall({
      target,
      payload,
      tools,
      toolDefinitions,
      agent
    });
    if (typeof result === 'string') {
      console.log(result);
    } else {
      console.log(JSON.stringify(result, null, 2));
    }
  } catch (error) {
    console.error(chalk.red(error.message));
    process.exit(1);
  }
}
