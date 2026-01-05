
import { Agent } from './src/agent.js';
import { AgentManager } from './src/agentManager.js';

// Mock Provider
class MockProvider {
    constructor(responses) {
        this.responses = responses || [];
        this.callCount = 0;
    }
    async chat(history, tools) {
        const response = this.responses[this.callCount] || { content: "I don't know." };
        this.callCount++;
        return response;
    }
}

async function testDelegation() {
    console.log("Setting up agents...");
    const manager = new AgentManager();
    
    // Create PM and Lead
    const pm = await manager.createAgent('project_manager', 'pm');
    const lead = await manager.createAgent('team_lead', 'lead');

    // Mock PM's provider to call delegate_task
    pm.provider = new MockProvider([
        {
            content: "I will delegate this to the team lead.",
            toolCalls: [{
                id: 'call_1',
                function: {
                    name: 'delegate_task',
                    arguments: JSON.stringify({
                        target_agent_id: 'lead',
                        instruction: 'Say hello to the world'
                    })
                }
            }]
        },
        { content: "Delegation complete." } // Second call after tool execution
    ]);

    // Mock Lead's provider to just respond
    lead.provider = new MockProvider([
        { content: "Hello World from Team Lead!" }
    ]);

    console.log("Starting chat with PM...");
    const response = await pm.chat("Please tell the lead to say hello", async (msg) => {
        console.log(`[Confirm] ${msg}`);
        return true;
    });

    console.log("\nFinal Response from PM:", response);
}

testDelegation().catch(console.error);
