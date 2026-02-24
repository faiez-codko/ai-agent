import nodemailer from 'nodemailer';
import imaps from 'imap-simple';
import { simpleParser } from 'mailparser';
import { loadConfig } from '../config.js';

async function getEmailConfig() {
    const config = await loadConfig();
    if (!config.email) {
        throw new Error("Email not configured. Please run setup to configure email credentials.");
    }
    return config.email;
}

export const emailTools = {
    send_email: async ({ to, subject, body, attachments = [] }) => {
        try {
            const config = await getEmailConfig();
            
            const transporter = nodemailer.createTransport({
                host: config.smtpHost,
                port: config.smtpPort,
                secure: config.smtpPort === 465, // true for 465, false for other ports
                auth: {
                    user: config.user,
                    pass: config.password
                }
            });

            const mailOptions = {
                from: config.user,
                to,
                subject,
                text: body
            };

            if (attachments && Array.isArray(attachments) && attachments.length > 0) {
                mailOptions.attachments = attachments.map(filePath => ({
                    path: filePath
                }));
            }

            const info = await transporter.sendMail(mailOptions);

            return `Email sent: ${info.messageId}`;
        } catch (error) {
            return `Error sending email: ${error.message}`;
        }
    },

    list_emails: async ({ limit = 5, unreadOnly = true }) => {
        try {
            const config = await getEmailConfig();
            
            const imapConfig = {
                imap: {
                    user: config.user,
                    password: config.password,
                    host: config.host,
                    port: config.port,
                    tls: config.tls,
                    authTimeout: 10000
                }
            };

            const connection = await imaps.connect(imapConfig);
            await connection.openBox('INBOX');

            const searchCriteria = [unreadOnly ? 'UNSEEN' : 'ALL'];
            const fetchOptions = {
                bodies: ['HEADER', 'TEXT'],
                markSeen: false,
                struct: true
            };

            const messages = await connection.search(searchCriteria, fetchOptions);
            
            // Sort by date descending
            messages.sort((a, b) => {
                return new Date(b.attributes.date) - new Date(a.attributes.date);
            });

            const recentMessages = messages.slice(0, limit);
            const results = [];

            for (const item of recentMessages) {
                const all = item.parts.find(part => part.which === 'TEXT');
                const id = item.attributes.uid;
                const idHeader = "Imap-Id: "+id+"\r\n";
                const simple = await simpleParser(idHeader + all.body);
                
                results.push({
                    from: item.parts.find(part => part.which === 'HEADER').body.from[0],
                    subject: item.parts.find(part => part.which === 'HEADER').body.subject[0],
                    date: item.attributes.date,
                    body: simple.text ? simple.text.substring(0, 200) + '...' : '(No text content)'
                });
            }

            connection.end();

            if (results.length === 0) return "No emails found.";
            
            return results.map(e => 
                `From: ${e.from}\nSubject: ${e.subject}\nDate: ${e.date}\nBody: ${e.body}\n---`
            ).join('\n');

        } catch (error) {
            return `Error listing emails: ${error.message}`;
        }
    }
};

export const emailToolDefinitions = [
    {
        name: "send_email",
        description: "Send an email using configured SMTP settings.",
        parameters: {
            type: "object",
            properties: {
                to: { type: "string", description: "Recipient email address" },
                subject: { type: "string", description: "Email subject" },
                body: { type: "string", description: "Email body text" },
                attachments: { 
                    type: "array", 
                    items: { type: "string" },
                    description: "List of absolute file paths to attach"
                }
            },
            required: ["to", "subject", "body"]
        }
    },
    {
        name: "list_emails",
        description: "List recent emails from the inbox.",
        parameters: {
            type: "object",
            properties: {
                limit: { type: "integer", description: "Number of emails to retrieve (default 5)" },
                unreadOnly: { type: "boolean", description: "Only show unread emails (default true)" }
            }
        }
    }
];
