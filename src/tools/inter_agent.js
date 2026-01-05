
import chalk from 'chalk';

export const delegate_task = async ({ target_agent_id, instruction }, { agent, confirmCallback }) => {
    console.log(chalk.yellow(`\n[Delegation] ${agent.name} -> ${target_agent_id}: ${instruction}\n`));
    if (!agent.manager) {
        return "Error: Agent manager not available. Cannot delegate tasks.";
    }

    // Resolve alias (e.g., "pm" -> "project_manager")
    // We need to search by name or id
    let targetAgent = agent.manager.getAgent(target_agent_id);
    
    // If not found by ID, try to find by name (alias) or partial match
    if (!targetAgent) {
        const agents = Array.from(agent.manager.agents.values());
        targetAgent = agents.find(a => a.name.toLowerCase() === target_agent_id.toLowerCase() || 
                                     a.personaId === target_agent_id);
    }

    if (!targetAgent) {
        return `Error: Agent '${target_agent_id}' not found. Available agents: ${agent.manager.listAgents().map(a => a.name).join(', ')}`;
    }

    if (targetAgent.name === agent.name) {
        return "Error: Cannot delegate task to self.";
    }

    console.log(chalk.yellow(`\n[Delegation] ${agent.name} -> ${targetAgent.name}: ${instruction}\n`));

    try {
        // Execute the task with the target agent
        // We might want to pass a special context or prefix to indicate it's a delegation
        const result = await targetAgent.chat(`[Request from ${agent.name}]: ${instruction}`, confirmCallback);
        
        console.log(chalk.yellow(`\n[Delegation Result] ${targetAgent.name} -> ${agent.name}: Task completed.\n`));
        return `Result from ${targetAgent.name}:\n${result}`;
    } catch (error) {
        return `Error executing task with ${targetAgent.name}: ${error.message}`;
    }
};
