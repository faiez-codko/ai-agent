import makeWASocket, { useMultiFileAuthState, fetchLatestBaileysVersion } from '@whiskeysockets/baileys';
import fs from 'fs';
import path from 'path';
import os from 'os';

let activeSocket = null;
let isConnected = false;
let connectPromise = null;

export function setActiveSocket(sock) {
    activeSocket = sock;
    isConnected = Boolean(sock?.ws && sock.ws.readyState === 1);
    try {
        sock?.ev?.on?.('connection.update', (update) => {
            if (update.connection === 'open') isConnected = true;
            if (update.connection === 'close') isConnected = false;
        });
    } catch {}
}

export function getActiveSocket() {
    return activeSocket;
}

async function ensureWhatsAppConnected() {
    if (activeSocket && isConnected) return activeSocket;
    if (connectPromise) return await connectPromise;

    connectPromise = (async () => {
        const authDir = path.join(os.homedir(), '.auth_info_baileys');
        if (!fs.existsSync(authDir)) {
            fs.mkdirSync(authDir, { recursive: true });
        }

        const { state, saveCreds } = await useMultiFileAuthState(authDir);
        const { version } = await fetchLatestBaileysVersion();

        const sock = makeWASocket({
            auth: state,
            version,
            browser: ["Windows", "Chrome", "128.0.0"]
        });

        setActiveSocket(sock);
        sock.ev.on('creds.update', saveCreds);

        await new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                cleanup();
                reject(new Error('WhatsApp connection timed out. Ensure integration is running and authenticated.'));
            }, 15000);

            const onUpdate = (update) => {
                if (update.qr) {
                    cleanup();
                    reject(new Error('WhatsApp is not authenticated. Run "ai-agent integration setup whatsapp" and scan the QR code.'));
                    return;
                }
                if (update.connection === 'open') {
                    cleanup();
                    resolve();
                    return;
                }
                if (update.connection === 'close') {
                    cleanup();
                    reject(new Error((update.lastDisconnect?.error)?.message || 'WhatsApp connection closed.'));
                }
            };

            const cleanup = () => {
                clearTimeout(timeout);
                sock.ev.off?.('connection.update', onUpdate);
                sock.ev.removeListener?.('connection.update', onUpdate);
            };

            sock.ev.on('connection.update', onUpdate);
        });

        return sock;
    })();

    try {
        return await connectPromise;
    } finally {
        connectPromise = null;
    }
}

export async function sendWhatsAppMessage(jid, text) {
    const sock = await ensureWhatsAppConnected();
    // Simple validation for JID (if it's just a number, append suffix)
    if (!jid.includes('@')) {
        jid = jid + '@s.whatsapp.net';
    }
    
    await sock.sendMessage(jid, { text });
    return `Message sent to ${jid}`;
}

export async function sendWhatsAppMedia(jid, mediaPath, caption = '', mediaType = 'auto') {
    const sock = await ensureWhatsAppConnected();
    if (!jid.includes('@')) {
        jid = jid + '@s.whatsapp.net';
    }

    // Determine media type if 'auto'
    if (mediaType === 'auto') {
        const ext = path.extname(mediaPath).toLowerCase();
        if (['.jpg', '.jpeg', '.png', '.gif', '.webp'].includes(ext)) mediaType = 'image';
        else if (['.mp4', '.mov', '.avi'].includes(ext)) mediaType = 'video';
        else if (['.mp3', '.wav', '.ogg'].includes(ext)) mediaType = 'audio';
        else mediaType = 'document';
    }

    const payload = {};
    
    // Check if path is URL or local file
    if (mediaPath.startsWith('http')) {
        payload[mediaType] = { url: mediaPath };
    } else {
        if (!fs.existsSync(mediaPath)) {
            throw new Error(`File not found: ${mediaPath}`);
        }
        // For local files, we can use the path in 'url' for Baileys, or buffer.
        // Using buffer is often safer for local files to ensure permissions/readability.
        const buffer = fs.readFileSync(mediaPath);
        payload[mediaType] = buffer;
    }

    if (caption) payload.caption = caption;
    
    // For documents, try to add mimetype and filename
    if (mediaType === 'document') {
        payload.fileName = path.basename(mediaPath);
        // We could add mimetype here if we had a library, but Baileys often infers or generic is fine.
    }
    // For audio, we might want ptt (push to talk)
    if (mediaType === 'audio') {
        payload.ptt = false; // Send as audio file, not voice note by default
    }

    await sock.sendMessage(jid, payload);
    return `Media (${mediaType}) sent to ${jid}`;
}
