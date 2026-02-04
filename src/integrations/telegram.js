import { Telegraf } from 'telegraf';
import inquirer from 'inquirer';
import chalk from 'chalk';
import { AgentManager } from '../agentManager.js';
import { IntegrationCommandHandler } from './commandHandler.js';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import { loadConfig, saveConfig } from '../config.js';

// Load env vars
dotenv.config();

export async function setupTelegram() {
    console.log(chalk.blue('Setting up Telegram Integration...'));

    let botToken = process.env.TELEGRAM_BOT_TOKEN;

    // Try loading from config if not in env
    if (!botToken) {
        const config = await loadConfig();
        console.log(config)
        botToken = config.telegram_bot_token;
    }
    console.log(chalk.blue(`Current Telegram Bot Token: ${botToken ? 'Set' : 'Not Set'}`));

    if (!botToken) {
        const answers = await inquirer.prompt([
            {
                type: 'password',
                name: 'token',
                message: 'Enter your Telegram Bot Token (from @BotFather):',
                mask: '*',
                validate: input => input.length > 0 ? true : 'Token is required'
            }
        ]);
        botToken = answers.token;
        
        // Save to config
        try {
            const config = await loadConfig();
            config.telegram_bot_token = botToken;
            await saveConfig(config);
            console.log(chalk.green('Telegram Bot Token saved to config file.'));
        } catch (error) {
            console.error(chalk.red('Failed to save token to config:'), error);
        }
    }

    // Custom fetch implementation with retry and longer timeout to handle connection issues
    const customFetch = async (url, options) => {
        const fetch = (await import('node-fetch')).default;
        const maxRetries = 3;
        const timeout = 30000; // 30 seconds

        for (let i = 0; i < maxRetries; i++) {
            try {
                const controller = new AbortController();
                const id = setTimeout(() => controller.abort(), timeout);
                
                const response = await fetch(url, {
                    ...options,
                    signal: controller.signal,
                    agent: undefined // Don't use default agent to avoid SSL/Keep-Alive issues
                });
                
                clearTimeout(id);
                return response;
            } catch (err) {
                if (i === maxRetries - 1) throw err;
                // Wait before retrying (exponential backoff)
                await new Promise(resolve => setTimeout(resolve, 1000 * Math.pow(2, i)));
            }
        }
    };

    const bot = new Telegraf(botToken, {
        handlerTimeout: 90000,
        telegram: {
             // We can't easily inject custom fetch into Telegraf 4.x directly in the constructor 
             // in a way that solves ECONNRESET globally for all polling.
             // Instead, we will try to use the default configuration but disable webhook reply
             // to ensure polling is used robustly.
        }
    });

    // Handle polling errors explicitly
    bot.catch((err, ctx) => {
        console.error(chalk.red(`Ooops, encountered an error for ${ctx.updateType}`), err);
        if (err.code === 'ECONNRESET') {
             console.log(chalk.yellow('Connection reset. Retrying...'));
        }
    });

    // Graceful stop
    process.once('SIGINT', () => bot.stop('SIGINT'));
    process.once('SIGTERM', () => bot.stop('SIGTERM'));

    // Define Strict Rules for Telegram
    const context = `CONTEXT AWARENESS:
You are communicating via Telegram. Keep responses concise and formatted for chat.

STRICT EXECUTION RULES:
1. When you need to execute code/scripts, you MUST save them to the script directory using \`write_file\`.
2. Execute the script using \`run_command\`.
3. Read the output.
4. IMMEDIATELY delete the script file using \`delete_file\` after execution.
5. Do not leave any files in the script directory.`;

    const manager = new AgentManager();
    await manager.init();

    // Ensure at least one agent exists
    if (manager.agents.size === 0) {
        await manager.createAgent('default', 'primary');
    }

    const commandHandler = new IntegrationCommandHandler(manager);
    
    console.log(chalk.blue('Agent initialized.'));

    bot.start((ctx) => {
        ctx.reply('Hello! I am your AI Agent. Mention me or reply to my messages to chat.');
    });

    bot.help((ctx) => {
        ctx.reply('Send me a message with @ai or mention my username to chat!');
    });

    bot.on('message', async (ctx) => {
        // Only text messages
        if (!ctx.message.text) return;

        const text = ctx.message.text;

        // 1. Command Handler
        if (text.startsWith('/')) {
             console.log(chalk.gray(`Command from ${ctx.from.first_name}: ${text}`));
             const result = await commandHandler.handle(text);
             if (result) {
                 await ctx.reply(result);
                 return;
             }
        }
        
        const botUsername = ctx.botInfo.username;
        const isPrivate = ctx.chat.type === 'private';
        
        // Logic:
        // 1. Private chat: Always reply (unless it's a command handled elsewhere, but on('message') catches all)
        // 2. Group chat: Reply if mentioned (@BotName) OR if text contains "@ai" OR if replying to bot's message
        
        const isMentioned = text.includes(`@${botUsername}`);
        const hasAiTag = text.toLowerCase().includes('@ai');
        const isReplyToBot = ctx.message.reply_to_message?.from?.id === ctx.botInfo.id;

        const shouldReply = isPrivate || isMentioned || hasAiTag || isReplyToBot;

        if (shouldReply) {
             // Show typing status
            await ctx.sendChatAction('typing');

            // Clean prompt
            // Remove @username and @ai
            let prompt = text.replace(new RegExp(`@${botUsername}`, 'gi'), '').replace(/@ai/gi, '').trim();

            if (!prompt) prompt = "Hello!"; // Default if only mention

            console.log(chalk.gray(`Received from ${ctx.from.first_name} (${ctx.chat.type}): ${prompt}`));

            try {
                let agent = manager.getActiveAgent();
                if (!agent) {
                     agent = await manager.createAgent('default', 'primary');
                     manager.setActiveAgent(agent.id);
                }

                // Inject context if needed
                const systemMsg = agent.memory.find(m => m.role === 'system');
                if (systemMsg && !systemMsg.content.includes('STRICT EXECUTION RULES')) {
                    systemMsg.content += `\n\n${context}`;
                } else if (!systemMsg) {
                     agent.memory.unshift({ role: 'system', content: `You are ${agent.name}.\n\n${context}` });
                }

                const response = await agent.chat(prompt);
                await ctx.reply(response);
                console.log(chalk.gray(`Sent response.`));
            } catch (error) {
                console.error('Error processing message:', error);
                await ctx.reply('Sorry, I encountered an error.');
            }
        }
    });

    console.log(chalk.green('Telegram Bot started! Waiting for messages...'));
    console.log(chalk.cyan(`Bot Username: @${(await bot.telegram.getMe()).username}`));
    
    await bot.launch();
}
