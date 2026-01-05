import inquirer from 'inquirer';
import chalk from 'chalk';
import { setup, read, update, fix, run } from './commands.js';
import { Agent } from './agent.js';
import ora from 'ora';

export async function startInteractiveMode() {
  console.clear();
  console.log(chalk.bold.blue('🤖 AI Agent Interactive Mode'));
  console.log(chalk.gray('Type /help to see available commands.'));
  console.log(chalk.gray('Type /exit to quit.'));
  console.log('');

  const agent = new Agent();
  await agent.init();

  while (true) {
    const { input } = await inquirer.prompt([
      {
        type: 'input',
        name: 'input',
        message: chalk.cyan('ai-agent >'),
        prefix: '',
      },
    ]);

    const trimmedInput = input.trim();
    if (!trimmedInput) continue;

    if (trimmedInput.startsWith('/')) {
      await handleCommand(trimmedInput, agent);
    } else {
      // Chat mode
      const spinner = ora('Thinking...').start();
      try {
        const response = await agent.chat(trimmedInput, async (message) => {
             // Pause spinner to ask for confirmation
             spinner.stop();
             const { confirm } = await inquirer.prompt([{
                 type: 'confirm',
                 name: 'confirm',
                 message: chalk.yellow(message),
                 default: false
             }]);
             spinner.start();
             return confirm;
        });
        spinner.stop();
        console.log(chalk.green('AI: ') + response);
        console.log('');
      } catch (error) {
        spinner.fail('Chat failed');
        console.error(chalk.red(error.message));
      }
    }
  }
}

async function handleCommand(inputLine, agent) {
  // Simple argument parser that respects quotes
  const args = inputLine.match(/(?:[^\s"]+|"[^"]*")+/g).map(arg => arg.replace(/^"|"$/g, ''));
  const command = args[0].toLowerCase();

  try {
    switch (command) {
      case '/help':
        showHelp();
        break;
      case '/exit':
      case '/quit':
        console.log(chalk.green('Goodbye!'));
        process.exit(0);
        break;
      case '/setup':
        await setup();
        // Re-init agent to pick up new config
        await agent.init();
        break;
      case '/read':
        if (args.length < 2) {
          console.log(chalk.red('Usage: /read <file> [query]'));
        } else {
          const file = args[1];
          const query = args.slice(2).join(' ');
          await read(file, query, agent);
        }
        break;
      case '/research':
          if (args.length < 2) {
            console.log(chalk.red('Usage: /research <directory>'));
          } else {
            const dir = args[1];
            const spinner = ora(`Researching directory ${dir}...`).start();
            const result = await agent.researchDirectory(dir);
            spinner.stop();
            console.log(chalk.blue.bold(`\nResearch Result for ${dir}:\n`));
            console.log(result);
            console.log('');
          }
          break;
      case '/update':
        if (args.length < 2) {
          console.log(chalk.red('Usage: /update <file> [instruction]'));
        } else {
          const file = args[1];
          const instruction = args.slice(2).join(' ');
          await update(file, instruction, agent);
        }
        break;
      case '/fix':
        if (args.length < 2) {
          console.log(chalk.red('Usage: /fix <file>'));
        } else {
          await fix(args[1], agent);
        }
        break;
      case '/run':
        if (args.length < 2) {
          console.log(chalk.red('Usage: /run <instruction>'));
        } else {
          const instruction = args.slice(1).join(' ');
          await run(instruction, agent);
        }
        break;
      case '/clear':
        agent.memory = [];
        await agent.init(); // Re-add system prompt
        console.log(chalk.yellow('Memory cleared.'));
        break;
      default:
        console.log(chalk.red(`Unknown command: ${command}`));
        console.log(chalk.gray('Type /help for list of commands.'));
    }
  } catch (error) {
    console.error(chalk.red(`Error executing command: ${error.message}`));
  }
  console.log(''); // Empty line for spacing
}

function showHelp() {
  console.log(chalk.bold('\nAvailable Commands:'));
  console.log(chalk.cyan('/setup') + '                   - Configure AI provider');
  console.log(chalk.cyan('/read <file> [query]') + '   - Analyze a file');
  console.log(chalk.cyan('/research <dir>') + '        - Analyze a directory structure and content');
  console.log(chalk.cyan('/update <file> <instr>') + ' - Update a file with instructions');
  console.log(chalk.cyan('/fix <file>') + '            - Fix errors in a file');
  console.log(chalk.cyan('/run <instruction>') + '     - Generate and run shell commands');
  console.log(chalk.cyan('/clear') + '                 - Clear chat memory');
  console.log(chalk.cyan('/help') + '                  - Show this help message');
  console.log(chalk.cyan('/exit') + '                  - Exit the program');
  console.log(chalk.gray('Type anything else to chat with the agent context-aware.'));
}
