
import { AgentManager } from '../agentManager.js';
import { clearChatHistory } from '../chatStorage.js';

export class IntegrationCommandHandler {
    constructor(agentManager) {
        this.manager = agentManager;
    }

    async handle(message) {
        if (!message) return null;
        const args = message.trim().split(/\s+/);
        const command = args[0].toLowerCase();
        
        switch (command) {
            case '/agent':
                return this.handleAgent();
            case '/clear':
                return this.handleClear();
            case '/switch-agent':
                return this.handleSwitch(args);
            case '/list':
                return this.handleList();
            case '/create':
                return this.handleCreate(args);
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
- /switch-agent <name_or_id>: Switch the active agent session.
- /clear: Clear the chat history and memory of the active agent.
- /help: Show this help message.

To chat with the agent, simply mention @ai or reply to its messages.`;
    }

    handleAgent() {
        const agent = this.manager.getActiveAgent();
        if (!agent) return "No active agent.";
        return `Current Agent: ${agent.name} (ID: ${agent.id})\nPersona: ${agent.personaId}`;
    }

    async handleClear() {
        const agent = this.manager.getActiveAgent();
        if (!agent) return "No active agent.";
        await clearChatHistory(agent.id);
        agent.memory = [];
        await agent.init();
        return `Chat history cleared for agent ${agent.name}.`;
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
}
