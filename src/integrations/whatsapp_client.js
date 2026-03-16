import makeWASocket, { useMultiFileAuthState, fetchLatestBaileysVersion } from '@whiskeysockets/baileys';
import fs from 'fs';
import path from 'path';
import os from 'os';

let activeSocket = null;
let isConnected = false;
let connectPromise = null;
const trackedPolls = new Map();

function normalizeWhatsAppJid(jid) {
    if (!jid.includes('@')) {
        return jid + '@s.whatsapp.net';
    }
    return jid;
}

function rememberTrackedPoll(sentMessage, metadata) {
    const messageId = sentMessage?.key?.id;
    if (!messageId || !sentMessage?.message) return;

    trackedPolls.set(messageId, {
        key: sentMessage.key,
        message: sentMessage.message,
        pollUpdates: [],
        createdAt: Date.now(),
        ...metadata
    });

    if (trackedPolls.size > 200) {
        const oldestId = trackedPolls.keys().next().value;
        trackedPolls.delete(oldestId);
    }
}

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

export function getTrackedWhatsAppPoll(messageId) {
    return trackedPolls.get(messageId) || null;
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
    jid = normalizeWhatsAppJid(jid);
    
    await sock.sendMessage(jid, { text });
    return `Message sent to ${jid}`;
}

export async function sendWhatsAppMedia(jid, mediaPath, caption = '', mediaType = 'auto') {
    const sock = await ensureWhatsAppConnected();
    jid = normalizeWhatsAppJid(jid);

    // Determine media type + mimetype
    const ext = path.extname(mediaPath).toLowerCase();
    const inferTypeFromExt = (e) => {
        if (['.jpg', '.jpeg', '.png', '.gif', '.webp'].includes(e)) return 'image';
        if (['.mp4', '.mov', '.avi', '.mkv', '.webm'].includes(e)) return 'video';
        if (['.mp3', '.wav', '.ogg', '.m4a', '.aac', '.opus'].includes(e)) return 'audio';
        return 'document';
    };
    const inferMime = (e) => {
        const map = {
            '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.gif': 'image/gif', '.webp': 'image/webp',
            '.mp4': 'video/mp4', '.mov': 'video/quicktime', '.avi': 'video/x-msvideo', '.mkv': 'video/x-matroska', '.webm': 'video/webm',
            '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.ogg': 'audio/ogg', '.m4a': 'audio/mp4', '.aac': 'audio/aac', '.opus': 'audio/ogg; codecs=opus',
            '.pdf': 'application/pdf', '.txt': 'text/plain', '.csv': 'text/csv',
            '.zip': 'application/zip', '.json': 'application/json',
            '.doc': 'application/msword', '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            '.xls': 'application/vnd.ms-excel', '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            '.ppt': 'application/vnd.ms-powerpoint', '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation'
        };
        return map[e] || 'application/octet-stream';
    };
    if (mediaType === 'auto') mediaType = inferTypeFromExt(ext);
    const mimetype = inferMime(ext);

    const payload = {};
    
    // Check if path is URL or local file
    if (mediaPath.startsWith('http')) {
        payload[mediaType] = { url: mediaPath };
    } else {
        if (!fs.existsSync(mediaPath)) {
            throw new Error(`File not found: ${mediaPath}`);
        }
        // For local files we pass Buffer
        const buffer = fs.readFileSync(mediaPath);
        payload[mediaType] = buffer;
    }

    // Common fields
    if (caption && (mediaType === 'image' || mediaType === 'video')) payload.caption = caption;
    // Mimetype is especially important for audio/document
    payload.mimetype = mimetype;
    
    if (mediaType === 'document') {
        payload.fileName = path.basename(mediaPath);
    }
    if (mediaType === 'audio') {
        // Send as standard audio file (not PTT voice note) by default
        payload.ptt = false;
    }

    await sock.sendMessage(jid, payload);
    return `Media (${mediaType}) sent to ${jid}`;
}

export async function sendWhatsAppPoll(jid, name, options, selectableCount = 1, toAnnouncementGroup = false) {
    const sock = await ensureWhatsAppConnected();
    jid = normalizeWhatsAppJid(jid);

    const values = Array.isArray(options)
        ? options.map(option => String(option).trim()).filter(Boolean)
        : [];

    if (values.length < 2) {
        throw new Error('WhatsApp polls require at least 2 options.');
    }

    if (!Number.isInteger(selectableCount) || selectableCount < 1 || selectableCount > values.length) {
        throw new Error(`selectableCount must be an integer between 1 and ${values.length}.`);
    }

    const sentMessage = await sock.sendMessage(jid, {
        poll: {
            name,
            values,
            selectableCount,
            toAnnouncementGroup
        }
    });

    rememberTrackedPoll(sentMessage, {
        jid,
        name,
        values,
        selectableCount
    });

    return `Poll sent to ${jid}: ${name}`;
}
