import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { AgentManager } from '../agentManager.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Adjust path to point to src/web/public
// src/tools/web_ui.js -> ../web/public
const PUBLIC_DIR = path.join(__dirname, '../web/public');

let server = null;
let manager = null;

async function getManager() {
    if (!manager) {
        manager = new AgentManager();
        await manager.init();
        
        // Create default agent if none exists
        if (manager.agents.size === 0) {
            await manager.createAgent('default', 'primary');
        }
    }
    return manager;
}

export const webUiToolDefinitions = [
  {
    name: 'start_chat_ui',
    description: 'Starts a local web server to serve the chat UI on localhost:8456.',
    parameters: {
      type: 'object',
      properties: {},
      required: [],
    },
  },
];

export const webUiTools = {
  start_chat_ui: async () => {
    if (server) {
      return 'Chat UI server is already running at http://localhost:8456';
    }

    const app = express();
    app.use(express.json());
    app.use(express.static(PUBLIC_DIR));

    // API Routes
    
    // Get all sessions (agents)
    app.get('/api/sessions', async (req, res) => {
        try {
            const mgr = await getManager();
            const sessions = Array.from(mgr.agents.values()).map(a => ({
                id: a.id,
                name: a.name || a.id,
                persona: a.personaId
            }));
            res.json(sessions);
        } catch (e) {
            res.status(500).json({ error: e.message });
        }
    });

    // Create new session
    app.post('/api/sessions', async (req, res) => {
        try {
            const mgr = await getManager();
            const { personaId, name } = req.body;
            // Generate a simple name/id if not provided
            const agent = await mgr.createAgent(personaId || 'default', name);
            res.json({
                id: agent.id,
                name: agent.name,
                persona: agent.personaId
            });
        } catch (e) {
            res.status(500).json({ error: e.message });
        }
    });

    // Get chat history for a session
    app.get('/api/history/:id', async (req, res) => {
        try {
            const mgr = await getManager();
            const agent = mgr.getAgent(req.params.id);
            if (!agent) {
                return res.status(404).json({ error: 'Session not found' });
            }
            res.json(agent.memory);
        } catch (e) {
            res.status(500).json({ error: e.message });
        }
    });

    // Send message
    app.post('/api/chat', async (req, res) => {
        try {
            const { sessionId, message } = req.body;
            if (!sessionId || !message) {
                return res.status(400).json({ error: 'Missing sessionId or message' });
            }

            const mgr = await getManager();
            const agent = mgr.getAgent(sessionId);
            if (!agent) {
                return res.status(404).json({ error: 'Session not found' });
            }

            // Simple auto-confirmation for tools
            const confirmCallback = async (msg) => {
                console.log(`[WebUI Auto-Confirm] ${msg}`);
                return true;
            };

            const response = await agent.chat(message, confirmCallback);
            res.json({ response });
        } catch (e) {
            console.error('Chat error:', e);
            res.status(500).json({ error: e.message });
        }
    });

    return new Promise((resolve, reject) => {
      try {
        server = app.listen(8456, () => {
            console.log('Chat UI server started on port 8456');
            resolve('Chat UI server started successfully at http://localhost:8456');
        });
        
        server.on('error', (e) => {
             if (e.code === 'EADDRINUSE') {
                // If port is in use, assume it's our server or another instance
                console.log('Port 8456 is already in use.');
                resolve('Chat UI server is already running at http://localhost:8456 (port 8456 in use)');
             } else {
                reject(e);
             }
        });
      } catch (error) {
        reject(error);
      }
    });
  },
};
