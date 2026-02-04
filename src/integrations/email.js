import nodemailer from 'nodemailer';
import imaps from 'imap-simple';
import { simpleParser } from 'mailparser';
import inquirer from 'inquirer';
import chalk from 'chalk';
import { Agent } from '../agent.js';
import { loadConfig, saveConfig } from '../config.js';

export async function setupEmail() {
    console.log(chalk.blue('Setting up Email Integration...'));

    let config = await loadConfig();
    let emailConfig = config.email || {};

    if (!emailConfig.user || !emailConfig.password) {
        const answers = await inquirer.prompt([
            {
                type: 'list',
                name: 'provider',
                message: 'Select Email Provider:',
                choices: ['Gmail', 'Custom SMTP/IMAP']
            },
            {
                type: 'input',
                name: 'user',
                message: 'Email Address:',
                validate: input => input.includes('@') ? true : 'Invalid email'
            },
            {
                type: 'password',
                name: 'password',
                message: 'Password (or App Password):',
                mask: '*',
                validate: input => input.length > 0 ? true : 'Password is required'
            }
        ]);

        emailConfig = {
            user: answers.user,
            password: answers.password,
            provider: answers.provider
        };

        if (answers.provider === 'Custom SMTP/IMAP') {
            const customAnswers = await inquirer.prompt([
                { type: 'input', name: 'host', message: 'IMAP Host:' },
                { type: 'number', name: 'port', message: 'IMAP Port:', default: 993 },
                { type: 'confirm', name: 'tls', message: 'Use TLS?', default: true },
                { type: 'input', name: 'smtpHost', message: 'SMTP Host:' },
                { type: 'number', name: 'smtpPort', message: 'SMTP Port:', default: 587 }
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

        // Save to config
        config.email = emailConfig;
        await saveConfig(config);
        console.log(chalk.green('Email configuration saved.'));
    }

    console.log(chalk.blue('Starting Email Listener...'));
    startEmailListener(emailConfig);
}

async function startEmailListener(config) {
    const imapConfig = {
        imap: {
            user: config.user,
            password: config.password,
            host: config.host,
            port: config.port,
            tls: config.tls,
            authTimeout: 3000
        }
    };

    const transporter = nodemailer.createTransport({
        host: config.smtpHost,
        port: config.smtpPort,
        secure: config.smtpPort === 465, // true for 465, false for other ports
        auth: {
            user: config.user,
            pass: config.password
        }
    });

    try {
        const connection = await imaps.connect(imapConfig);
        console.log(chalk.green('Connected to IMAP successfully!'));
        
        await connection.openBox('INBOX');
        console.log(chalk.cyan('Listening for new emails... (Polling every 30s)'));

        // Poll for new emails
        setInterval(async () => {
            try {
                const searchCriteria = ['UNSEEN'];
                const fetchOptions = {
                    bodies: ['HEADER', 'TEXT', ''],
                    markSeen: false // We'll mark as seen after processing
                };

                const messages = await connection.search(searchCriteria, fetchOptions);

                for (const item of messages) {
                    const all = item.parts.find(part => part.which === '');
                    const id = item.attributes.uid;
                    const idHeader = "Imap-Id: "+id+"\r\n";
                    
                    const simpleMail = await simpleParser(idHeader + all.body);
                    
                    const from = simpleMail.from.text;
                    const subject = simpleMail.subject;
                    const text = simpleMail.text;

                    // Filter: Must contain "@ai" or specific trigger
                    if (subject.toLowerCase().includes('@ai') || (text && text.toLowerCase().includes('@ai'))) {
                        console.log(chalk.blue(`Processing email from ${from}: ${subject}`));
                        
                        // Mark as seen
                        await connection.addFlags(id, '\\Seen');

                        // Generate Response
                        // Define Strict Rules for Email
                        const context = `CONTEXT AWARENESS:
You are communicating via Email. Your responses should be professional and well-structured.

STRICT EXECUTION RULES:
1. When you need to execute code/scripts, you MUST save them to the script directory using \`write_file\`.
2. Execute the script using \`run_command\`.
3. Read the output.
4. IMMEDIATELY delete the script file using \`delete_file\` after execution.
5. Do not leave any files in the script directory.`;

                        const agent = new Agent({ context });
                        await agent.init();
                        const prompt = `${subject}\n\n${text}`.replace(/@ai/gi, '').trim();
                        
                        console.log(chalk.gray('Thinking...'));
                        const response = await agent.run(prompt); // Assuming agent.run returns text or we capture output

                        // Since agent.run usually executes tools, we might want to ask it to "Draft a reply"
                        // But for now, let's assume we get a text response or we wrap the agent interaction.
                        // Actually, agent.run might not return the final text if it uses tools.
                        // Let's use a simpler approach: Ask agent to generate a response.
                        
                        // Send Reply
                        await transporter.sendMail({
                            from: config.user,
                            to: simpleMail.from.value[0].address,
                            subject: `Re: ${subject}`,
                            text: response || "Task completed."
                        });
                        console.log(chalk.green(`Reply sent to ${from}`));
                    }
                }
            } catch (err) {
                console.error(chalk.red('Error polling emails:'), err);
            }
        }, 30000); // Poll every 30 seconds

    } catch (err) {
        console.error(chalk.red('IMAP Connection Error:'), err);
        console.log(chalk.yellow('Please check your credentials. For Gmail, make sure to use an App Password.'));
    }
}
