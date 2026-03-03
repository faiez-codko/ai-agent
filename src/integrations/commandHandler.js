import { AgentManager } from '../agentManager.js';
import { clearChatHistory, listSessions } from '../chatStorage.js';
import { savePersona, loadPersona } from '../personas/index.js';

export class IntegrationCommandHandler {
    constructor(agentManager) {
        this.manager = agentManager;
    }

    async handle(message, options = {}) {
        if (!message) return null;
        const args = message.trim().split(/\s+/);
        const command = args[0].toLowerCase();
        const agent = options.agent || this.manager.getActiveAgent();
        
        switch (command) {
            case '/agent':
                return this.handleAgent(agent);
            case '/clear':
                return this.handleClear(agent);
            case '/switch-agent':
                return this.handleSwitch(args);
            case '/list':
                return this.handleList();
            case '/create':
                return this.handleCreate(args);
            case '/create-persona':
                return this.handleCreatePersona(args);
            case '/session':
                return this.handleSession(args, agent);
            case '/help':
                return this.handleHelp();
            default:
                return null;
        }
    }

    handleHelp() {
        return `Available Commands:
- /agent: Show details of the currently active agent.
- /list: List all available agents and their IDs.
- /create <persona> [name]: Create a new agent (e.g., /create developer my-dev).
- /create-persona <id> <system_prompt>: Define a new persona behavior (e.g., /create-persona poetic "You speak in rhymes").
- /switch-agent <name_or_id>: Switch the active agent session.
- /clear: Clear the chat history and memory of the active agent.
- /session <new|list|switch> [args]: Manage sessions for the active agent.
- /help: Show this help message.

To chat with the agent, simply mention @ai or reply to its messages.`;
    }

    handleAgent(agent) {
        if (!agent) return "No active agent.";
        return `Current Agent: ${agent.name} (ID: ${agent.id})\nPersona: ${agent.personaId}`;
    }

    async handleClear(agent) {
        if (!agent) return "No active agent.";
        try {
            await agent.startNewSession();
            return `New session started. Memory cleared for agent ${agent.name}.`;
        } catch (e) {
            try {
                await clearChatHistory(agent.id);
                agent.sessionId = null;
                agent.memory = [];
                await agent.init();
                return `Chat history cleared for agent ${agent.name}.`;
            } catch (e2) {
                return `Failed to clear memory: ${e2.message || e2}`;
            }
        }
    }

    async handleSession(args, agent) {
        if (!agent) return "No active agent.";
        if (args.length < 2) return "Usage: /session <new|list|switch> [args]";
        const subCmd = args[1].toLowerCase();

        if (subCmd === 'new') {
            await agent.startNewSession();
            return `New session started for agent ${agent.name}.`;
        }

        if (subCmd === 'switch') {
            if (args.length < 3) return "Usage: /session switch <sessionId>";
            await agent.loadSession(args[2]);
            return `Switched to session ${args[2]} for agent ${agent.name}.`;
        }

        if (subCmd === 'list') {
            const all = await listSessions(50);
            const sessions = all.filter(s => s.agent_id === agent.id).slice(0, 10);
            if (sessions.length === 0) return `No sessions found for agent ${agent.name}.`;
            let out = `Recent Sessions for ${agent.name}:\n`;
            sessions.forEach(s => {
                const msg = s.first_message ? (s.first_message.substring(0, 50) + (s.first_message.length > 50 ? '...' : '')) : '(No messages)';
                out += `- ${s.id} | ${new Date(s.created_at).toLocaleString()} | ${s.message_count} | ${msg}\n`;
            });
            return out.trimEnd();
        }

        return "Unknown session command. Use new, list, or switch.";
    }

    async handleSwitch(args) {
        if (args.length < 2) return "Usage: /switch-agent <agent_name_or_id>";
        const target = args[1];
        if (this.manager.setActiveAgent(target)) {
            return `Switched to agent: ${target}`;
        }
        return `Agent '${target}' not found. Use /list to see available agents.`;
    }

    handleList() {
        const agents = this.manager.listAgents();
        if (agents.length === 0) return "No agents available.";
        
        let output = "Available Agents:\n";
        agents.forEach(a => {
            const active = a.id === this.manager.activeAgentId ? " (Active)" : "";
            output += `- ${a.name} [${a.id}]${active}\n`;
        });
        return output;
    }

    async handleCreate(args) {
        if (args.length < 2) {
             const personas = await this.manager.listAvailablePersonas();
             return `Usage: /create <persona> [name]\nAvailable personas: ${personas.join(', ')}`;
        }
        const persona = args[1];
        const name = args[2] || null;
        try {
            const newAgent = await this.manager.createAgent(persona, name);
            this.manager.setActiveAgent(newAgent.id);
            return `Created and switched to agent: ${newAgent.name}`;
        } catch (e) {
            return `Failed to create agent: ${e.message}`;
        }
    }

    async handleCreatePersona(args) {
        if (args.length < 3) {
            return "Usage: /create-persona <id> <system_prompt>\nExample: /create-persona poetic You speak in rhymes.";
        }
        
        const id = args[1];
        // Join the rest of the arguments to form the system prompt
        const systemPrompt = args.slice(2).join(' ');
        
        try {
            // Load default persona to copy allowed tools
            const defaultPersona = await loadPersona('default');
            
            const newPersona = {
                id,
                name: id, // Use ID as name for simplicity
                systemPrompt,
                allowedTools: defaultPersona.allowedTools || [],
                description: 'Created via chat interface'
            };
            
            await savePersona(newPersona);
            return `Persona '${id}' created successfully!\nYou can now use it with: /create ${id} [agent_name]`;
        } catch (e) {
            return `Failed to create persona: ${e.message}`;
        }
    }
}
