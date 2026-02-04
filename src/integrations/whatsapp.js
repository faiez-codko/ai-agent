import makeWASocket, { useMultiFileAuthState, DisconnectReason, jidNormalizedUser } from '@whiskeysockets/baileys';
import qrcode from 'qrcode-terminal';
import path from 'path';
import fs from 'fs';
import chalk from 'chalk';
import { Agent } from '../agent.js';

const AUTH_DIR = path.join(process.cwd(), '.auth_info_baileys');

export async function setupWhatsApp() {
    console.log(chalk.blue('Setting up WhatsApp Integration...'));
    
    if (!fs.existsSync(AUTH_DIR)) {
        fs.mkdirSync(AUTH_DIR, { recursive: true });
    }

    const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);

    const sock = makeWASocket({
        auth: state,
        browser: ["AI Agent", "Chrome", "1.0.0"]
    });

    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect, qr } = update;
        
        if (qr) {
            console.log(chalk.yellow('Scan this QR code with your WhatsApp:'));
            qrcode.generate(qr, { small: true });
        }

        if (connection === 'close') {
            const shouldReconnect = (lastDisconnect?.error)?.output?.statusCode !== DisconnectReason.loggedOut;
            console.log('Connection closed due to ', lastDisconnect?.error, ', reconnecting ', shouldReconnect);
            if (shouldReconnect) {
                setupWhatsApp();
            }
        } else if (connection === 'open') {
            console.log(chalk.green('WhatsApp connection opened successfully!'));
            console.log(chalk.cyan('Integration is ready. You can now chat with the agent via WhatsApp.'));
            
            // Start listening for messages
            startListening(sock);
        }
    });

    sock.ev.on('creds.update', saveCreds);
}

async function startListening(sock) {
    const agent = new Agent();
    await agent.init();
    
    // Keep track of messages sent by the bot to avoid loops
    const sentMsgIds = new Set();
    const meId = jidNormalizedUser(sock.user.id);
    
    console.log(chalk.blue('Agent initialized and listening for WhatsApp messages...'));
    console.log(chalk.gray(`My JID: ${meId}`));

    sock.ev.on('messages.upsert', async (m) => {
        const msg = m.messages[0];
        if (!msg.message) return; // Ignore if no message content
        if (m.type !== 'notify' && m.type !== 'append') return; // Only process new messages

        const remoteJid = msg.key.remoteJid;
        const isFromMe = msg.key.fromMe;
        const msgId = msg.key.id;

        // Loop prevention: Ignore messages we sent ourselves via code
        if (sentMsgIds.has(msgId)) {
            return;
        }

        // Logic:
        // 1. Check if message contains '@ai' (case insensitive)
        // 2. If yes, process and reply (regardless of who sent it)
        // 3. Loop prevention is handled by sentMsgIds AND the fact that bot response likely won't contain '@ai'
        
        const text = msg.message.conversation || msg.message.extendedTextMessage?.text;
        
        if (!text) return;

        // Trigger Check: Must contain "@ai"
        if (!text.toLowerCase().includes('@ai')) {
            return;
        }

        console.log(chalk.gray(`Triggered by ${isFromMe ? 'ME' : remoteJid}: ${text}`));

        // Clean the prompt (remove @ai)
        const prompt = text.replace(/@ai/gi, '').trim();

        if (!prompt) return; // Ignore empty prompts after removing tag

        // Send "typing..." status
        await sock.sendPresenceUpdate('composing', remoteJid);

        try {
            const response = await agent.chat(prompt);
            
            // Stop "typing..."
            await sock.sendPresenceUpdate('paused', remoteJid);
            
            // Send response
            const sentMsg = await sock.sendMessage(remoteJid, { text: response });
            if (sentMsg?.key?.id) {
                sentMsgIds.add(sentMsg.key.id);
                // Cleanup old IDs to prevent memory leak
                if (sentMsgIds.size > 1000) {
                    const first = sentMsgIds.values().next().value;
                    sentMsgIds.delete(first);
                }
            }
            console.log(chalk.gray(`Sent to ${remoteJid}: ${response}`));
        } catch (error) {
            console.error('Error processing message:', error);
        }
    });
}
