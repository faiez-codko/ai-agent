import { Agent } from './agent.js';
import { listPersonas } from './personas/index.js';
import chalk from 'chalk';

export class AgentManager {
    constructor() {
        this.agents = new Map();
        this.activeAgentId = null;
    }

    async createAgent(personaId, customId = null) {
        // Unique ID for the agent instance
        const id = customId || `${personaId}-${Math.random().toString(36).substr(2, 4)}`;
        
        console.log(chalk.gray(`Creating agent ${id} with persona ${personaId}...`));
        
        const agent = new Agent({ personaId, name: id });
        await agent.init();
        
        this.agents.set(id, agent);
        
        if (!this.activeAgentId) {
            this.activeAgentId = id;
        }
        
        return agent;
    }

    getAgent(id) {
        return this.agents.get(id);
    }

    getActiveAgent() {
        if (!this.activeAgentId && this.agents.size > 0) {
            this.activeAgentId = this.agents.keys().next().value;
        }
        return this.agents.get(this.activeAgentId);
    }

    setActiveAgent(id) {
        if (this.agents.has(id)) {
            this.activeAgentId = id;
            return true;
        }
        return false;
    }

    listAgents() {
        return Array.from(this.agents.values()).map(a => ({
            id: a.name,
            name: a.persona.name,
            persona: a.personaId,
            description: a.persona.description || a.persona.name
        }));
    }
    
    async listAvailablePersonas() {
        return await listPersonas();
    }
}
