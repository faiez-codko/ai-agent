
import fs from 'fs/promises';
import path from 'path';
import sqlite3 from 'sqlite3';
import { open } from 'sqlite';

const DB_FILE = path.join(process.cwd(), '.agent', '.ai-agent-chat.sqlite');
const MAX_SIZE_BYTES = 100 * 1024 * 1024;

let dbPromise = null;

async function initDb() {
    await fs.mkdir(path.dirname(DB_FILE), { recursive: true });
    const db = await open({
        filename: DB_FILE,
        driver: sqlite3.Database
    });
    await db.exec(`
        CREATE TABLE IF NOT EXISTS chat_history (
            agent_id TEXT PRIMARY KEY,
            messages TEXT NOT NULL
        )
    `);
    return db;
}

function getDb() {
    if (!dbPromise) {
        dbPromise = initDb();
    }
    return dbPromise;
}

export async function loadChatHistory(agentId) {
    try {
        const db = await getDb();
        const row = await db.get(
            'SELECT messages FROM chat_history WHERE agent_id = ?',
            agentId
        );
        if (!row || !row.messages) {
            return [];
        }
        return JSON.parse(row.messages);
    } catch (error) {
        return [];
    }
}

export async function saveChatHistory(agentId, messages) {
    const db = await getDb();

    let storedMessages = Array.isArray(messages) ? messages : [];
    let content = JSON.stringify(storedMessages, null, 2);
    let size = Buffer.byteLength(content, 'utf8');

    if (size > MAX_SIZE_BYTES) {
        console.warn(
            `Chat history size (${(size / 1024 / 1024).toFixed(
                2
            )}MB) exceeds limit (30MB). Clearing history for ${agentId}...`
        );

        const systemPrompt = storedMessages.find(m => m.role === 'system');
        const recent = storedMessages.slice(-5);
        storedMessages = systemPrompt ? [systemPrompt, ...recent] : recent;

        content = JSON.stringify(storedMessages, null, 2);
        size = Buffer.byteLength(content, 'utf8');

        if (size > MAX_SIZE_BYTES) {
            console.warn(
                'Chat history for this agent still exceeds limit. Keeping minimal context.'
            );
            const minimal = systemPrompt ? [systemPrompt] : [];
            storedMessages = minimal;
            content = JSON.stringify(storedMessages, null, 2);
        }
    }

    await db.run(
        `
        INSERT INTO chat_history (agent_id, messages)
        VALUES (?, ?)
        ON CONFLICT(agent_id) DO UPDATE SET messages = excluded.messages
    `,
        agentId,
        content
    );
}

export async function clearChatHistory(agentId = null) {
    if (agentId) {
        try {
            const db = await getDb();
            await db.run('DELETE FROM chat_history WHERE agent_id = ?', agentId);
        } catch (e) {}
    } else {
        await fs.unlink(DB_FILE).catch(() => {});
        dbPromise = null;
    }
}
