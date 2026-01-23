import inquirer from 'inquirer';
import chalk from 'chalk';
import ora from 'ora';
import { saveConfig, loadConfig } from './config.js';
import { Agent } from './agent.js';
import { writeFile, readFile } from './tools/fs.js';
import { runCommand } from './tools/shell.js';
import * as Diff from 'diff';
import { webUiTools } from './tools/web_ui.js';

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
  const config = await loadConfig();
  
  const answers = await inquirer.prompt([
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

  const newConfig = {
    ...config,
    provider: answers.provider,
    model: answers.model,
  };

  // Save keys specifically for the provider
  if (answers.provider === 'openai') {
      newConfig.openai_api_key = answers.apiKey;
  } else if (answers.provider === 'gemini') {
      newConfig.gemini_api_key = answers.apiKey;
  } else if (answers.provider === 'compatible') {
      newConfig.compatible_api_key = answers.apiKey;
      newConfig.compatible_base_url = answers.baseUrl;
  }

  await saveConfig(newConfig);

  console.log(chalk.green('Configuration saved!'));
  console.log(chalk.yellow('Make sure to set your API keys in environment variables (.env) or your shell.'));
  console.log(`OPENAI_API_KEY, GEMINI_API_KEY, or COMPATIBLE_API_KEY`);
}

export async function read(filePath, query, agentInstance = null) {
  const spinner = ora('Analyzing file...').start();
  try {
    const agent = agentInstance || new Agent();
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
    const agent = agentInstance || new Agent();
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
    const agent = agentInstance || new Agent();
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
    const agent = agentInstance || new Agent();
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
