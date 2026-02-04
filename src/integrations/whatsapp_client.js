import makeWASocket from '@whiskeysockets/baileys';

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
