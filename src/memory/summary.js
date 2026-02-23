import { saveChatHistory } from '../chatStorage.js';
import { createCheckpoint } from './checkpoints.js';
import chalk from 'chalk';
import fs from 'fs';
import path from 'path';

// Constants
const MAX_CONTEXT_TOKENS = 120000; // Safe limit for GPT-4o (128k context)
const SUMMARY_THRESHOLD = 40000; // Trigger summary early to prevent drift
const MESSAGES_TO_KEEP = 15; // Keep last N messages raw
const TOKEN_ESTIMATE_CHAR = 4; // 1 token ~= 4 chars

function estimateTokens(messages) {
    let text = '';
    for (const msg of messages) {
        if (msg.content) text += msg.content;
        if (msg.tool_calls) text += JSON.stringify(msg.tool_calls);
    }
    return Math.ceil(text.length / TOKEN_ESTIMATE_CHAR);
}

/**
 * Save the current task state to a file so it survives summarization.
 * This is the KEY fix for the "forgot what it was doing" problem.
 */
function saveTaskState(agentId, taskGoal, toolCallCount, memory) {
    try {
        const stateDir = path.join(process.cwd(), '.agent', agentId || 'default');
        if (!fs.existsSync(stateDir)) {
            fs.mkdirSync(stateDir, { recursive: true });
        }
        const statePath = path.join(stateDir, 'active_task.md');

        // Extract what we've been doing from the conversation
        // Look for the FIRST user message (the original request) and the first assistant response
        const userMessages = memory.filter(m => m.role === 'user');
        const assistantMessages = memory.filter(m => m.role === 'assistant' && m.content && !m.tool_calls);

        // Build a task state doc
        let taskState = `# Active Task State\n`;
        taskState += `## Original Goal\n${taskGoal || '(unknown)'}\n\n`;

        // Include the first user message (full context of what was asked)
        if (userMessages.length > 0) {
            taskState += `## Full Original Request\n${userMessages[0].content}\n\n`;
        }

        // Include any plan/structure from early assistant responses
        if (assistantMessages.length > 0) {
            const firstResponse = assistantMessages[0].content;
            if (firstResponse && firstResponse.length > 50) {
                taskState += `## Initial Plan/Understanding\n${firstResponse.substring(0, 5000)}\n\n`;
            }
        }

        // Track which tools were called and what they did (last 20 tool results, compressed)
        const toolResults = memory
            .filter(m => m.role === 'tool' && m.content)
            .slice(-20)
            .map(m => {
                const name = m.name || 'unknown';
                const preview = m.content.substring(0, 5000).replace(/\n/g, ' ');
                return `- ${name}: ${preview}`;
            });

        if (toolResults.length > 0) {
            taskState += `## Recent Tool Activity (last ${toolResults.length} calls)\n${toolResults.join('\n')}\n\n`;
        }

        taskState += `## Stats\n- Total tool calls: ${toolCallCount}\n- Saved at: ${new Date().toISOString()}\n`;

        fs.writeFileSync(statePath, taskState);
        console.log(chalk.gray(`💾 Task state saved to ${statePath}`));
        return statePath;
    } catch (e) {
        console.error('Failed to save task state:', e.message);
        return null;
    }
}

/**
 * Load the saved task state (if it exists) and return it as a context string.
 */
function loadTaskState(agentId) {
    try {
        const stateDir = path.join(process.cwd(), '.agent', agentId || 'default');
        const statePath = path.join(stateDir, 'active_task.md');
        if (fs.existsSync(statePath)) {
            return fs.readFileSync(statePath, 'utf-8');
        }
    } catch (e) {
        // ignore
    }
    return null;
}

export async function summarizeMemory(agent) {
    const totalTokens = estimateTokens(agent.memory);

    if (totalTokens < SUMMARY_THRESHOLD) {
        return false;
    }

    console.log(chalk.yellow(`\n⚠️  Memory usage high (~${totalTokens} tokens). Summarizing...`));

    // ─── CRITICAL: Save task state BEFORE summarizing ───
    // This ensures we don't lose the current goal during compression
    const taskStatePath = saveTaskState(
        agent.id,
        agent._currentTaskGoal,
        agent._toolCallCount || 0,
        agent.memory
    );

    // 1. Identify split point
    let systemPromptIdx = -1;
    if (agent.memory.length > 0 && agent.memory[0].role === 'system') {
        systemPromptIdx = 0;
    }

    const startIndex = systemPromptIdx + 1;
    const endIndex = Math.max(startIndex, agent.memory.length - MESSAGES_TO_KEEP);

    if (startIndex >= endIndex) {
        console.log(chalk.gray("Not enough messages to summarize yet."));
        return false;
    }

    const messagesToSummarize = agent.memory.slice(startIndex, endIndex);
    const messagesToKeep = agent.memory.slice(endIndex);

    // 2. Create Checkpoint (replaces old archive)
    const checkpointId = createCheckpoint(messagesToSummarize, "Pending Summary");
    console.log(chalk.blue(`📌 Created checkpoint ${checkpointId}`));

    // 3. Generate Summary — with STRONG emphasis on preserving the task goal
    try {
        // Extract what the user originally asked for
        const originalGoal = agent._currentTaskGoal || '(unknown)';
        const firstUserMsg = agent.memory.find(m => m.role === 'user');
        const fullOriginalRequest = firstUserMsg ? firstUserMsg.content : originalGoal;

        const summaryPrompt = `You are summarizing a conversation to free up context window space. 

CRITICAL RULE: The summary MUST preserve the user's ORIGINAL TASK and its sub-tasks so the agent can continue working after summarization. If the task had multiple parts (A, B, C, D or steps 1-5), list them ALL explicitly.

The user's original request was:
"""
${fullOriginalRequest.substring(0, 3000)}
"""

Now summarize the following conversation history. Structure your summary as:

1. **CURRENT TASK**: What the user asked for (with ALL sub-tasks/parts listed explicitly)
2. **COMPLETED SO FAR**: What has been done (be specific — file paths, commands run, changes made)
3. **IN PROGRESS / NEXT**: What was being worked on when we stopped
4. **KEY FACTS**: Important technical details (file paths, variable names, configs, architecture decisions)
5. **BLOCKED / ISSUES**: Any errors or problems encountered

History to summarize:
${messagesToSummarize.map(m => `${m.role}: ${JSON.stringify(m.content || m.tool_calls).substring(0, 500)}`).join('\n')}
`;

        const summaryResponse = await agent.provider.generate(
            summaryPrompt,
            "You summarize technical conversations. NEVER lose the original task goal or its sub-parts. Be specific with file paths, code changes, and progress."
        );

        // Build the post-summarization context with task state
        const summaryMessage = {
            role: 'system',
            content: `[MEMORY CHECKPOINT]: ${checkpointId}\nSummary:\n${summaryResponse}\n\n[CONTEXT NOTE]: Detailed conversation history for this period is saved in checkpoint "${checkpointId}". If you need specific details (code snippets, exact quotes) from this period, call tool \`read_checkpoint("${checkpointId}")\`.\n\n[ACTIVE TASK]: "${originalGoal}"\nFull original request: "${fullOriginalRequest.substring(0, 500)}"\nYou have made ${agent._toolCallCount || 0} tool calls. Continue.`
        };

        // 4. Update Memory
        const newMemory = [];
        if (systemPromptIdx !== -1) {
            newMemory.push(agent.memory[0]);
        }
        newMemory.push(summaryMessage);
        newMemory.push(...messagesToKeep);

        agent.memory = newMemory;

        // Save the compacted memory
        await saveChatHistory(agent.id, agent.memory, agent);

        console.log(chalk.green(`✅ Memory summarized. Reduced from ${messagesToSummarize.length + messagesToKeep.length} to ${newMemory.length} messages.`));
        return true;

    } catch (e) {
        console.error("Failed to summarize memory:", e);
        return false;
    }
}

export { saveTaskState, loadTaskState };
