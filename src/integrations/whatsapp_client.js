import makeWASocket from '@whiskeysockets/baileys';
import fs from 'fs';
import path from 'path';

let activeSocket = null;

export function setActiveSocket(sock) {
    activeSocket = sock;
}

export function getActiveSocket() {
    return activeSocket;
}

export async function sendWhatsAppMessage(jid, text) {
    if (!activeSocket) {
        throw new Error('WhatsApp is not connected or not authenticated.');
    }
    // Simple validation for JID (if it's just a number, append suffix)
    if (!jid.includes('@')) {
        jid = jid + '@s.whatsapp.net';
    }
    
    await activeSocket.sendMessage(jid, { text });
    return `Message sent to ${jid}`;
}

export async function sendWhatsAppMedia(jid, mediaPath, caption = '', mediaType = 'auto') {
    if (!activeSocket) {
        throw new Error('WhatsApp is not connected or not authenticated.');
    }
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

    await activeSocket.sendMessage(jid, payload);
    return `Media (${mediaType}) sent to ${jid}`;
}
