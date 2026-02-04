import makeWASocket, { useMultiFileAuthState, DisconnectReason, jidNormalizedUser, downloadMediaMessage } from '@whiskeysockets/baileys';
import qrcode from 'qrcode-terminal';
import path from 'path';
import fs from 'fs';
import os from 'os';
import chalk from 'chalk';
import { AgentManager } from '../agentManager.js';
import { IntegrationCommandHandler } from './commandHandler.js';
import { setActiveSocket, sendWhatsAppMedia } from './whatsapp_client.js';
import { loadConfig } from '../config.js';
import { generateAudio } from '../tools/audio.js';

const AUTH_DIR = path.join(os.homedir(), '.auth_info_baileys');

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
    setActiveSocket(sock);

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
    // Define Strict Rules for WhatsApp
    const context = `CONTEXT AWARENESS:
You are communicating via WhatsApp. Keep responses concise and avoid complex markdown tables if possible.

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
    
    // Keep track of messages sent by the bot to avoid loops
    const sentMsgIds = new Set();
    const meId = jidNormalizedUser(sock.user.id);
    
    // Ensure temp media dir exists
    const MEDIA_DIR = path.join(process.cwd(), '.media_temp');
    if (!fs.existsSync(MEDIA_DIR)) {
        fs.mkdirSync(MEDIA_DIR, { recursive: true });
    }

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

        const imageMessage = msg.message.imageMessage;
        let text = msg.message.conversation || msg.message.extendedTextMessage?.text || imageMessage?.caption || "";
        
        let mediaPath = null;
        if (imageMessage) {
            try {
                // Download image
                const buffer = await downloadMediaMessage(
                    msg,
                    'buffer',
                    { },
                    { 
                        logger: console,
                        reuploadRequest: sock.updateMediaMessage
                    }
                );
                
                const ext = imageMessage.mimetype?.includes('png') ? 'png' : 'jpg';
                const filename = `${msgId}.${ext}`;
                mediaPath = path.join(MEDIA_DIR, filename);
                fs.writeFileSync(mediaPath, buffer);
                
                // If no text, provide default prompt
                if (!text) text = "Analyze this image.";
                
                console.log(chalk.gray(`Received image from ${remoteJid}, saved to ${mediaPath}`));
            } catch (err) {
                console.error("Failed to download media:", err);
            }
        }

        if (!text && !mediaPath) return;

        // 1. Command Handler
        if (text.startsWith('/')) {
             console.log(chalk.gray(`Command from ${remoteJid}: ${text}`));
             const result = await commandHandler.handle(text);
             if (result) {
                 const sent = await sock.sendMessage(remoteJid, { text: result });
                 if (sent?.key?.id) sentMsgIds.add(sent.key.id);
                 return;
             }
        }

        // 2. Trigger Check: 
        // - Trigger if explicitly mentioned (@ai)
        // - Trigger if it's a "Self Chat" (Note to Self)
        const isSelfChat = remoteJid === meId;
        const isTriggered = text.toLowerCase().includes('@ai') || isSelfChat || !!mediaPath;

        if (!isTriggered) {
            // Cleanup media if not triggered
            if (mediaPath && fs.existsSync(mediaPath)) fs.unlinkSync(mediaPath);
            return;
        }

        console.log(chalk.gray(`Triggered by ${isFromMe ? 'ME' : remoteJid}: ${text}`));

        // Clean the prompt (remove @ai if present)
        let prompt = text.replace(/@ai/gi, '').trim();

        if (!prompt && !mediaPath) return; // Ignore empty prompts after removing tag

        // Attach image info to prompt if present
        if (mediaPath) {
            prompt = `[System: User attached an image at ${mediaPath}. Use the 'analyze_image' tool to see it.]\n${prompt}`;
        }

        // Send "typing..." status
        await sock.sendPresenceUpdate('composing', remoteJid);

        try {
            // Get or Create Agent for this specific user (JID)
            // Sanitize JID for use as an ID (remove special chars)
            const safeJid = remoteJid.replace(/[^a-zA-Z0-9]/g, '_');
            const agentId = `wa_${safeJid}`;
            
            let agent = manager.agents.get(agentId);
            
            if (!agent) {
                console.log(chalk.blue(`Creating new agent session for WhatsApp user: ${remoteJid}`));
                agent = await manager.createAgent('default', agentId);
                // We don't set this as the *global* active agent to avoid interfering with CLI
            }

            // Inject context if needed
            const systemMsg = agent.memory.find(m => m.role === 'system');
            
            // Ensure agent directory exists for this user
            const agentDir = path.join(process.cwd(), '.agent', agentId);
            if (!fs.existsSync(agentDir)) {
                 fs.mkdirSync(agentDir, { recursive: true });
            }

            if (systemMsg && !systemMsg.content.includes('STRICT EXECUTION RULES')) {
                systemMsg.content += `\n\n${context}`;
            } else if (!systemMsg) {
                 // Should not happen if agent.init() was called, but just in case
                 agent.memory.unshift({ role: 'system', content: `You are ${agent.name}.\n\n${context}` });
            }

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

            // Audio Response
            try {
                const config = await loadConfig();
                if (config.audio_enabled) {
                    const audioPath = await generateAudio(response, config.audio_voice);
                    if (audioPath) {
                        await sendWhatsAppMedia(remoteJid, audioPath, '', 'audio');
                        // Cleanup audio file
                        if (fs.existsSync(audioPath)) fs.unlinkSync(audioPath);
                    }
                }
            } catch (err) {
                console.error("Failed to send audio response:", err);
            }

            // Cleanup media file after processing
            if (mediaPath && fs.existsSync(mediaPath)) {
                fs.unlinkSync(mediaPath);
            }
        } catch (error) {
            console.error('Error processing message:', error);
            await sock.sendMessage(remoteJid, { text: `Error: ${error.message}` });
        }
    });
}
