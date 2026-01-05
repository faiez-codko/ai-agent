
import fs from 'fs/promises';
import path from 'path';
import os from 'os';

const CHAT_FILE = path.join(os.homedir(), '.ai-agent-chat.json');
const MAX_SIZE_BYTES = 30 * 1024 * 1024; // 30MB

export async function loadChatHistory(agentId) {
    try {
        const data = await fs.readFile(CHAT_FILE, 'utf-8');
        const history = JSON.parse(data);
        return history[agentId] || [];
    } catch (error) {
        return [];
    }
}

export async function saveChatHistory(agentId, messages) {
    let history = {};
    try {
        const data = await fs.readFile(CHAT_FILE, 'utf-8');
        history = JSON.parse(data);
    } catch (error) {
        // File doesn't exist or is invalid, start fresh
    }

    history[agentId] = messages;

    // Convert to string to check size
    let content = JSON.stringify(history, null, 2);
    let size = Buffer.byteLength(content, 'utf8');

    if (size > MAX_SIZE_BYTES) {
        // Strategy: Clear ONLY the current agent's history first if it's too big, 
        // or clear everything if we really need space. 
        // The user requirement says "then clear chat", implying a hard reset or rotation.
        // Let's try to just keep the last few messages for the current agent, or wipe if still too big.
        
        console.warn(`Chat history size (${(size / 1024 / 1024).toFixed(2)}MB) exceeds limit (30MB). Clearing history for ${agentId}...`);
        
        // Keep only the system prompt (first message usually) and maybe last 5
        const systemPrompt = messages.find(m => m.role === 'system');
        const recent = messages.slice(-5);
        history[agentId] = systemPrompt ? [systemPrompt, ...recent] : recent;
        
        content = JSON.stringify(history, null, 2);
        size = Buffer.byteLength(content, 'utf8');
        
        // If still too big (e.g. other agents are hoarding data), wipe everything
        if (size > MAX_SIZE_BYTES) {
             console.warn("Total chat storage still exceeds limit. Clearing ALL chat history.");
             history = {};
             // Restore just the current agent's minimal context
             history[agentId] = systemPrompt ? [systemPrompt] : [];
             content = JSON.stringify(history, null, 2);
        }
    }

    await fs.writeFile(CHAT_FILE, content);
}

export async function clearChatHistory(agentId = null) {
    if (agentId) {
        let history = {};
        try {
            const data = await fs.readFile(CHAT_FILE, 'utf-8');
            history = JSON.parse(data);
        } catch (e) {}
        
        delete history[agentId];
        await fs.writeFile(CHAT_FILE, JSON.stringify(history, null, 2));
    } else {
        await fs.unlink(CHAT_FILE).catch(() => {});
    }
}
