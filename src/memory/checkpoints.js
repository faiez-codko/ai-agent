import fs from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';

const CHECKPOINT_DIR = path.join(process.cwd(), '.agent', 'memory', 'checkpoints');

// Ensure checkpoint directory exists
if (!fs.existsSync(CHECKPOINT_DIR)) {
    fs.mkdirSync(CHECKPOINT_DIR, { recursive: true });
}

/**
 * Creates a checkpoint from a set of messages.
 * @param {Array} messages - The messages to archive.
 * @param {string} summary - A summary of these messages.
 * @returns {string} The checkpoint ID.
 */
export function createCheckpoint(messages, summary) {
    const id = `ckpt_${Date.now()}_${uuidv4().substring(0, 8)}`;
    const filePath = path.join(CHECKPOINT_DIR, `${id}.json`);
    
    const data = {
        id,
        timestamp: new Date().toISOString(),
        summary,
        message_count: messages.length,
        messages
    };

    fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
    return id;
}

/**
 * Loads a checkpoint by ID.
 * @param {string} id - The checkpoint ID.
 * @returns {Object|null} The checkpoint data or null if not found.
 */
export function loadCheckpoint(id) {
    const filePath = path.join(CHECKPOINT_DIR, `${id}.json`);
    if (fs.existsSync(filePath)) {
        return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    }
    return null;
}

/**
 * Lists all available checkpoints.
 * @returns {Array} List of checkpoint metadata.
 */
export function listCheckpoints() {
    if (!fs.existsSync(CHECKPOINT_DIR)) return [];
    
    return fs.readdirSync(CHECKPOINT_DIR)
        .filter(f => f.endsWith('.json'))
        .map(f => {
            try {
                const content = JSON.parse(fs.readFileSync(path.join(CHECKPOINT_DIR, f), 'utf-8'));
                return {
                    id: content.id,
                    timestamp: content.timestamp,
                    summary: content.summary,
                    message_count: content.message_count
                };
            } catch {
                return null;
            }
        })
        .filter(Boolean)
        .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
}
