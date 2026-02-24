
import fs from 'fs/promises';
import path from 'path';
import sqlite3 from 'sqlite3';
import { open } from 'sqlite';

const DB_FILE = path.join(process.cwd(), '.agent', '.ai-agent-chat.sqlite');
const MAX_SIZE_BYTES = 100 * 1024 * 1024; // Keep this for file size check if needed, but per-agent limits are handled differently now

let dbPromise = null;

async function initDb() {
    await fs.mkdir(path.dirname(DB_FILE), { recursive: true });
    const db = await open({
        filename: DB_FILE,
        driver: sqlite3.Database
    });

    await db.exec('PRAGMA foreign_keys = ON;');

    // 1. Agents Table
    await db.exec(`
        CREATE TABLE IF NOT EXISTS agents (
            agent_id TEXT PRIMARY KEY,
            agent_name TEXT,
            about_agent TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
    `);

    // 2. Chat Sessions Table
    await db.exec(`
        CREATE TABLE IF NOT EXISTS chat_sessions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            agent_id TEXT NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (agent_id) REFERENCES agents(agent_id) ON DELETE CASCADE
        );
    `);

    // 3. Chat Messages Table
    await db.exec(`
        CREATE TABLE IF NOT EXISTS chat (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            session_id INTEGER NOT NULL,
            role TEXT NOT NULL,
            content TEXT,
            tool_calls TEXT,
            tool_call_id TEXT,
            name TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (session_id) REFERENCES chat_sessions(id) ON DELETE CASCADE
        );
    `);

    // 4. Tool Executions Table (New)
    await db.exec(`
        CREATE TABLE IF NOT EXISTS tool_executions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            session_id INTEGER NOT NULL,
            tool_name TEXT NOT NULL,
            args TEXT,
            output TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (session_id) REFERENCES chat_sessions(id) ON DELETE CASCADE
        );
    `);

    // Migration Check
    try {
        const legacyTable = await db.get("SELECT name FROM sqlite_master WHERE type='table' AND name='chat_history'");
        if (legacyTable) {
            console.log("Migrating legacy chat history...");
            const rows = await db.all("SELECT * FROM chat_history");
            for (const row of rows) {
                const agentId = row.agent_id;
                let messages = [];
                try { messages = JSON.parse(row.messages); } catch (e) {}

                if (messages.length > 0) {
                    // Create agent placeholder
                    await db.run("INSERT OR IGNORE INTO agents (agent_id, agent_name) VALUES (?, ?)", agentId, agentId);
                    
                    // Create session
                    const result = await db.run("INSERT INTO chat_sessions (agent_id) VALUES (?)", agentId);
                    const sessionId = result.lastID;

                    // Insert messages
                    for (const msg of messages) {
                         await db.run(
                            "INSERT INTO chat (session_id, role, content, tool_calls, tool_call_id, name) VALUES (?, ?, ?, ?, ?, ?)",
                            sessionId, 
                            msg.role, 
                            msg.content || '', 
                            msg.tool_calls ? JSON.stringify(msg.tool_calls) : null,
                            msg.tool_call_id || null,
                            msg.name || null
                        );
                    }
                }
            }
            await db.exec("DROP TABLE chat_history");
        }
    } catch (e) {
        console.error("Migration warning:", e);
    }

    return db;
}

function getDb() {
    if (!dbPromise) {
        dbPromise = initDb();
    }
    return dbPromise;
}

export async function createSession(agentId) {
    const db = await getDb();
    // Ensure agent exists to satisfy foreign key constraint
    await db.run("INSERT OR IGNORE INTO agents (agent_id, agent_name) VALUES (?, ?)", agentId, agentId);
    
    const result = await db.run("INSERT INTO chat_sessions (agent_id) VALUES (?)", agentId);
    return result.lastID;
}

export async function loadChatHistory(agentId, sessionId = null) {
    try {
        const db = await getDb();
        
        let session;
        if (sessionId) {
            session = await db.get("SELECT id FROM chat_sessions WHERE id = ? AND agent_id = ?", sessionId, agentId);
        } else {
            // Get the latest session for this agent
            session = await db.get(
                "SELECT id FROM chat_sessions WHERE agent_id = ? ORDER BY id DESC LIMIT 1",
                agentId
            );
        }

        if (!session) {
            return { messages: [], sessionId: null };
        }

        const rows = await db.all(
            "SELECT role, content, tool_calls, tool_call_id, name FROM chat WHERE session_id = ? ORDER BY id ASC",
            session.id
        );

        return {
            messages: rows.map(row => {
                const msg = {
                    role: row.role,
                    content: row.content
                };
                if (row.tool_calls) {
                    try { msg.tool_calls = JSON.parse(row.tool_calls); } catch (e) {}
                }
                if (row.tool_call_id) msg.tool_call_id = row.tool_call_id;
                if (row.name) msg.name = row.name;
                return msg;
            }),
            sessionId: session.id
        };

    } catch (error) {
        console.error("Error loading chat history:", error);
        return { messages: [], sessionId: null };
    }
}

export async function logToolExecution(sessionId, toolName, args, output) {
    if (!sessionId) return null;
    try {
        const db = await getDb();
        const result = await db.run(
            `INSERT INTO tool_executions (session_id, tool_name, args, output) VALUES (?, ?, ?, ?)`,
            [sessionId, toolName, JSON.stringify(args), output]
        );
        return result.lastID;
    } catch (error) {
        console.error("Error logging tool execution:", error);
        return null;
    }
}

export async function getToolExecution(id) {
    try {
        const db = await getDb();
        const row = await db.get("SELECT output FROM tool_executions WHERE id = ?", id);
        return row ? row.output : null;
    } catch (error) {
        console.error("Error getting tool execution:", error);
        return null;
    }
}

export async function saveChatHistory(agentId, messages, agentInstance = null, sessionId = null) {
    const db = await getDb();

    // 1. Ensure Agent Exists
    if (agentInstance) {
        await db.run(
            `INSERT INTO agents (agent_id, agent_name, about_agent) 
             VALUES (?, ?, ?) 
             ON CONFLICT(agent_id) DO UPDATE SET 
                agent_name = excluded.agent_name,
                about_agent = excluded.about_agent`,
            agentId,
            agentInstance.name || agentId,
            agentInstance.persona ? agentInstance.persona.description : null
        );
    } else {
        // Fallback if no instance provided
        await db.run("INSERT OR IGNORE INTO agents (agent_id, agent_name) VALUES (?, ?)", agentId, agentId);
    }

    // 2. Get or Create Session
    let session;
    if (sessionId) {
        session = await db.get("SELECT id FROM chat_sessions WHERE id = ?", sessionId);
        if (!session) {
             // If ID provided but not found, fallback to create new? Or error?
             // Let's create it if valid integer, otherwise just create new.
             // Actually, safer to create a new one if not found to avoid errors, 
             // but if user expects specific ID, this is weird.
             // Let's assume if sessionId is passed, it *should* exist. 
             // If not, we create a new one.
             console.warn(`Session ${sessionId} not found, creating new one.`);
             const result = await db.run("INSERT INTO chat_sessions (agent_id) VALUES (?)", agentId);
             session = { id: result.lastID };
        }
    } else {
        // Reuse latest or create
        session = await db.get(
            "SELECT id FROM chat_sessions WHERE agent_id = ? ORDER BY id DESC LIMIT 1",
            agentId
        );
        if (!session) {
            const result = await db.run("INSERT INTO chat_sessions (agent_id) VALUES (?)", agentId);
            session = { id: result.lastID };
        }
    }

    // 3. Sync Messages
    // Strategy: Delete all for this session and re-insert. 
    // This handles pruning/summarization correctly (where old messages are removed from memory).
    await db.run("DELETE FROM chat WHERE session_id = ?", session.id);
    
    // Prepare statement for bulk insert
    const stmt = await db.prepare(
        "INSERT INTO chat (session_id, role, content, tool_calls, tool_call_id, name) VALUES (?, ?, ?, ?, ?, ?)"
    );

    for (const msg of messages) {
        await stmt.run(
            session.id,
            msg.role,
            msg.content || '',
            msg.tool_calls ? JSON.stringify(msg.tool_calls) : null,
            msg.tool_call_id || null,
            msg.name || null
        );
    }
    await stmt.finalize();

    return session.id;
}

export async function clearChatHistory(agentId = null) {
    const db = await getDb();
    if (agentId) {
        await db.run("DELETE FROM agents WHERE agent_id = ?", agentId);
    } else {
        // Drop all data?
        await db.run("DELETE FROM chat");
        await db.run("DELETE FROM chat_sessions");
        await db.run("DELETE FROM agents");
    }
}

export async function listSessions(limit = 10) {
    const db = await getDb();
    return await db.all(`
        SELECT 
            s.id, 
            s.agent_id, 
            s.created_at,
            (SELECT COUNT(*) FROM chat c WHERE c.session_id = s.id) as message_count,
            (SELECT content FROM chat c WHERE c.session_id = s.id AND role = 'user' LIMIT 1) as first_message
        FROM chat_sessions s
        ORDER BY s.created_at DESC
        LIMIT ?
    `, limit);
}

export async function getSession(sessionId) {
    const db = await getDb();
    const session = await db.get("SELECT * FROM chat_sessions WHERE id = ?", sessionId);
    if (!session) return null;

    const messages = await db.all("SELECT * FROM chat WHERE session_id = ? ORDER BY id ASC", sessionId);
    const toolExecutions = await db.all("SELECT * FROM tool_executions WHERE session_id = ? ORDER BY id ASC", sessionId);

    return {
        ...session,
        messages,
        toolExecutions
    };
}
