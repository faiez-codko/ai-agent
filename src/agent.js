import { getAIProvider } from './ai/index.js';
import { readFile, writeFile, listFiles } from './tools/fs.js';
import { runCommand } from './tools/shell.js';
import { tools as toolImplementations, toolDefinitions } from './tools/index.js';
import { loadPersona } from './personas/index.js';
import { loadChatHistory, saveChatHistory, logToolExecution, createSession } from './chatStorage.js';
import { summarizeMemory, saveTaskState, getContextUsage, formatContextUsageLine, MAX_CONTEXT_TOKENS } from './memory/summary.js';
import { loadWorkspaceContext } from './memory/workspace.js';
import { sendMessage as sendTelegramMessage } from './tools/telegram.js';
import chalk from 'chalk';
import path from 'path';
import os from 'os';
import fs from 'fs';

export class Agent {
    constructor(config = {}) {
        this.provider = null;
        this.memory = []; // Store chat history

        // Config properties
        this.cwd = process.cwd();
        this.personaId = config.personaId || 'default';
        this.persona = null; // Loaded in init()
        this.initialModel = config.model || null;
        this.additionalContext = config.context || ''; // Extra instructions (e.g. for integrations)

        // ID is stable identifier (e.g. for storage)
        // Name is display name / persona name
        this.id = config.id || config.name || `${this.personaId}-${Math.random().toString(36).substr(2, 4)}`;
        this.name = config.name || null; // Will be set from persona if null

        this.manager = config.manager || null;
        this.safeMode = config.safeMode || false; // If true, requires confirmation for side-effects
        this.config = config || {};

        // Tools will be filtered in init()
        this.toolsDefinition = [];
        this.tools = {};
        
        this.sessionId = null; // Track current session ID for DB logging

        // Task anchoring — tracks the original user request to prevent drift
        this._currentTaskGoal = null;
        this._toolCallCount = 0;
        this._taskAnchorInterval = 5; // Re-inject goal every N tool calls
    }

    async init() {
        this.provider = await getAIProvider(this.initialModel);

        // Load Persona
        this.persona = await loadPersona(this.personaId);

        // Set name if not provided in config
        if (!this.name) {
            this.name = this.persona.name;
        }

        // Filter tools based on persona
        const allowed = new Set(this.persona.allowedTools || []);
        this.toolsDefinition = toolDefinitions.filter(t => allowed.has(t.name));

        // Map implementations
        this.tools = {};
        for (const name of allowed) {
            if (toolImplementations[name]) {
                this.tools[name] = toolImplementations[name];
            }
        }

        // Ensure Script Directory Exists (if context implies usage)
        const scriptDir = path.join(os.homedir(), '.agent', 'scripts');
        if (!fs.existsSync(scriptDir)) {
            try {
                fs.mkdirSync(scriptDir, { recursive: true });
            } catch (e) {
                console.error('Failed to create script directory:', e);
            }
        }

        // Use a unique sub-directory for this agent's planning files if id is provided
        const agentDir = this.id !== 'default' ? `.agent/${this.id}` : '.agent';
        const taskPlanPath = `${agentDir}/task_plan.md`;
        const notesPath = `${agentDir}/notes.md`;

        // ─── Build System Prompt from Workspace Knowledge ───
        // Load structured workspace context (SOUL.md, TOOLS.md, AGENTS.md, MEMORY.md, daily memory)
        let workspaceKnowledge = '';
        try {
            workspaceKnowledge = loadWorkspaceContext();
        } catch (e) {
            console.error('Failed to load workspace context:', e);
        }

        let systemPrompt = `You are ${this.name}.
${this.persona.systemPrompt}

═══ WORKSPACE KNOWLEDGE ═══
${workspaceKnowledge || '(No workspace knowledge loaded)'}
═══ END WORKSPACE KNOWLEDGE ═══`;

        // Load Chat History
        // If config provided a sessionId, use it. Otherwise, load latest.
        const history = await loadChatHistory(this.id, this.sessionId);
        this.memory = history.messages;
        this.sessionId = history.sessionId;
        
        // If no session exists yet (new agent), this.sessionId might be null.
        // It will be created on first save.

        this.systemPrompt = systemPrompt;

        // Ensure system prompt is in memory (for _buildContext)
        if (this.memory.length === 0) {
            this.memory.push({ role: 'system', content: systemPrompt });
        } else {
            // Update existing system prompt if present, or prepend it
            if (this.memory[0].role === 'system') {
                this.memory[0].content = systemPrompt;
            } else {
                this.memory.unshift({ role: 'system', content: systemPrompt });
            }
        }
    }

    async startNewSession() {
        this.sessionId = await createSession(this.id);
        this.memory = [];
        if (this.systemPrompt) {
            this.memory.push({ role: 'system', content: this.systemPrompt });
        }
        console.log(chalk.green(`Started new session: ${this.sessionId}`));
        return this.sessionId;
    }

    async loadSession(sessionId) {
        const history = await loadChatHistory(this.id, sessionId);
        if (!history.sessionId) {
            throw new Error(`Session ${sessionId} not found for agent ${this.id}`);
        }
        this.memory = history.messages;
        this.sessionId = history.sessionId;
        
        // Ensure system prompt is in memory
        if (this.systemPrompt) {
            if (this.memory.length === 0) {
                this.memory.push({ role: 'system', content: this.systemPrompt });
            } else {
                if (this.memory[0].role === 'system') {
                    this.memory[0].content = this.systemPrompt;
                } else {
                    this.memory.unshift({ role: 'system', content: this.systemPrompt });
                }
            }
        }

        console.log(chalk.green(`Loaded session: ${this.sessionId}`));
        return this.sessionId;
    }

    async chat(userMessage, confirmCallback = null, onUpdate = null) {
        this.memory.push({ role: 'user', content: userMessage });

        // Ensure session exists immediately so we can log tool calls
        if (!this.sessionId) {
            try {
                this.sessionId = await saveChatHistory(this.id, this.memory, this, this.sessionId);
            } catch (e) {
                console.error("Failed to create session for DB logging:", e);
            }
        }

        // ─── Task Anchoring: Track the original goal ───
        // Store the FULL user message as the raw goal
        this._currentTaskGoal = userMessage;
        this._expandedTaskGoal = null; // Will be set after the first AI response
        this._toolCallCount = 0;

        // Check and summarize memory if needed
        await summarizeMemory(this);
        await this._enforceHardContextReset(onUpdate);

        let loopCount = 0;
        const MAX_LOOPS = 60;
        const CHECKPOINT_INTERVAL = 50; // Force checkpoint every N tool calls
        let finalResponse = null;

        if (onUpdate) onUpdate({ type: 'thinking', message: 'Analyzing request...' });

        while (loopCount < MAX_LOOPS) {
            loopCount++;
            await this._enforceHardContextReset(onUpdate);
            const messagesForModel = this._buildContext();

            const response = await this.provider.chat(messagesForModel, this.toolsDefinition, onUpdate);
            try {
                sendTelegramMessage(`Agent ${this.id} response: ${response.content} \nTool Calls: ${JSON.stringify(response.toolCalls || [])}`);
            } catch { }

            // Fallback: Check for JSON tool calls in content if native toolCalls are empty
            if ((!response.toolCalls || response.toolCalls.length === 0) && response.content) {
                // Regex to find JSON blocks (supports json, python, or no language tag)
                // Modified to be more lenient: optional code blocks
                const jsonMatch = response.content.match(/```(?:json|python|js)?\s*(\{[\s\S]*?\})\s*```/) ||
                    response.content.match(/^\s*(\{[\s\S]*?\})\s*$/); // Match raw JSON if it's the only thing (or main thing)

                if (jsonMatch) {
                    try {
                        const parsed = JSON.parse(jsonMatch[1]);
                        // Support various formats the model might hallucinate
                        const toolName = parsed.tool || parsed.cmd_type || parsed.function || parsed.name;

                        if (toolName && this.tools[toolName]) {
                            // It's a valid tool call!
                            // If args are nested (like in my instruction), use them. 
                            // If flat (like the user's error log), use the whole object.
                            const args = parsed.args || parsed.arguments || parsed.parameters || parsed;

                            const fakeToolCall = {
                                id: 'fallback-' + Date.now(),
                                function: {
                                    name: toolName,
                                    arguments: JSON.stringify(args)
                                }
                            };

                            // Initialize toolCalls array
                            response.toolCalls = [fakeToolCall];

                            // Optional: Clean up the content so we don't show the raw JSON to user twice
                            // But for now, keeping it might be useful for debugging. 
                            // Let's append a note.
                            console.log(chalk.yellow(`(Detected JSON tool call in text: ${toolName})`));
                        }
                    } catch (e) {
                        // Ignore parse errors, it might just be code snippet
                    }
                }
            }

            // Handle Assistant Response
            // If content is present, add it to memory (some models output thought + tool call)
            // CRITICAL FIX: If tool calls are present, they MUST be included in the same assistant message
            // to satisfy OpenAI API requirements (tool_calls must be on the assistant message preceding tool roles).

            if (response.toolCalls && response.toolCalls.length > 0) {
                this.memory.push({
                    role: 'assistant',
                    content: response.content || null,
                    tool_calls: response.toolCalls
                });
                if (response.content) {
                    finalResponse = response.content;
                    // ─── Smart Task Anchor: Capture the AI's UNDERSTANDING of the task ───
                    // After the first response, the AI has likely expanded "do A B C D" into specifics.
                    // Save that expanded understanding for future anchors.
                    if (!this._expandedTaskGoal && response.content.length > 50) {
                        this._expandedTaskGoal = response.content.substring(0, 800);
                    }
                }
            } else if (response.content) {
                this.memory.push({ role: 'assistant', content: response.content });
                finalResponse = response.content;
            }

            // If no tool calls, we are done
            if (!response.toolCalls || response.toolCalls.length === 0) {
                const usageLine = formatContextUsageLine(this.memory);
                await saveChatHistory(this.id, this.memory, this, this.sessionId);
                if (onUpdate) onUpdate({ type: 'context_usage', content: usageLine });
                if (onUpdate) onUpdate({ type: 'done' });
                const baseResponse = finalResponse || response.content || '';
                return `${baseResponse}\n\n${usageLine}`;
            }

            // If we have tool calls, execute them
            for (const call of response.toolCalls) {
                const toolName = call.function.name;
                const args = JSON.parse(call.function.arguments);

                this._toolCallCount++;
                console.log(chalk.cyan(`\n🛠️  Tool Call #${this._toolCallCount}: ${chalk.bold(toolName)}`));
                console.log(chalk.gray(`   Args: ${JSON.stringify(args)}`));

                if (onUpdate) onUpdate({ type: 'tool_start', tool: toolName });

                let result;
                try {
                    if (this.tools[toolName]) {
                        // Pass confirmCallback and agent instance (this) to tools
                        result = await this.tools[toolName](args, { confirmCallback, agent: this });
                    } else {
                        result = `Error: Tool ${toolName} not found.`;
                    }
                } catch (e) {
                    result = `Error executing tool ${toolName}: ${e.message}`;
                    // Log errors to workspace learnings
                    try { appendError(`${toolName}: ${e.message}`, ''); } catch (le) { /* ignore */ }
                }

                if (onUpdate) onUpdate({ type: 'tool_end', tool: toolName, result: typeof result === 'string' ? result.substring(0, 100) + '...' : 'Done' });

                // Add result to memory
                let memoryContent = typeof result === 'string' ? result : JSON.stringify(result);

                // Always log full output to DB if session exists
                if (this.sessionId) {
                    await logToolExecution(this.sessionId, toolName, args, memoryContent);
                }

                this.memory.push({
                    role: 'tool',
                    tool_call_id: call.id,
                    name: toolName,
                    content: memoryContent
                });

                // ─── Smart Task Anchor Injection ───
                // Every N tool calls, inject a reminder using the EXPANDED task understanding
                if (this._toolCallCount > 0 && this._toolCallCount % this._taskAnchorInterval === 0 && this._currentTaskGoal) {
                    // Use the expanded understanding if available, otherwise fall back to raw user message
                    const goalText = this._expandedTaskGoal
                        ? `Original request: "${this._currentTaskGoal.substring(0, 200)}"
Your expanded understanding: ${this._expandedTaskGoal.substring(0, 600)}`
                        : `"${this._currentTaskGoal}"`;

                    this.memory.push({
                        role: 'system',
                        content: `[TASK ANCHOR — Reminder #${Math.floor(this._toolCallCount / this._taskAnchorInterval)}]
${goalText}
Tool calls so far: ${this._toolCallCount}. Stay focused. What is the NEXT step?`
                    });
                    console.log(chalk.magenta(`📌 Task anchor injected after ${this._toolCallCount} tool calls`));
                }

                // ─── Forced Checkpoint at CHECKPOINT_INTERVAL ───
                // If we've done 30+ tool calls, save task state to survive potential summarization
                if (this._toolCallCount > 0 && this._toolCallCount % CHECKPOINT_INTERVAL === 0) {
                    try {
                        saveTaskState(this.id, this._currentTaskGoal, this._toolCallCount, this.memory);
                        console.log(chalk.blue(`💾 Checkpoint saved at ${this._toolCallCount} tool calls`));
                    } catch (e) { /* ignore */ }
                }
            }
        }

        // ─── Auto Workspace Logging ───
        // If the task used 5+ tool calls, auto-log a summary to daily memory
        if (this._toolCallCount >= 5 && this._currentTaskGoal) {
            try {
                const summary = `Task: "${this._currentTaskGoal.substring(0, 100)}" — Completed with ${this._toolCallCount} tool calls.`;
                appendDailyMemory(summary);
                console.log(chalk.gray(`📝 Auto-logged task to daily memory (${this._toolCallCount} tool calls)`));
            } catch (e) { /* ignore */ }
        }

        // Loop limit reached
        if (loopCount >= MAX_LOOPS) {
            const limitMsg = `⚠️  Agent loop limit reached (${MAX_LOOPS}). History saved.`;
            console.log(chalk.red(limitMsg));
            await saveChatHistory(this.id, this.memory, this);
            if (onUpdate) onUpdate({ type: 'done' });
            return finalResponse || limitMsg;
        }

        if (onUpdate) onUpdate({ type: 'done' });
        const usageLine = formatContextUsageLine(this.memory);
        if (onUpdate) onUpdate({ type: 'context_usage', content: usageLine });
        return `${finalResponse || ''}\n\n${usageLine}`;
    }

    async _enforceHardContextReset(onUpdate = null) {
        const usage = getContextUsage(this.memory);
        if (usage.usedTokens < MAX_CONTEXT_TOKENS) return false;

        console.log(chalk.red(`⚠️  Context limit reached (${usage.usedTokens}/${MAX_CONTEXT_TOKENS}). Resetting with summary checkpoint...`));
        if (onUpdate) {
            onUpdate({
                type: 'thinking',
                message: `Context limit reached (${usage.percentUsed}%). Summarizing and resetting context...`
            });
        }

        await summarizeMemory(this, { force: true, fullCheckpoint: true });
        return true;
    }

    _buildContext(maxMessages = 40) {
        const systemMessages = this.memory.filter(m => m.role === 'system');
        const nonSystem = this.memory.filter(m => m.role !== 'system');
        let recent = nonSystem.slice(-maxMessages);

        // 1. Ensure context doesn't start with a 'tool' message (which would be orphaned)
        while (recent.length > 0 && recent[0].role === 'tool') {
            recent.shift();
        }

        // 2. SANITIZATION: Ensure every assistant message with tool_calls has matching tool messages
        const sanitizedRecent = [];
        let i = 0;
        while (i < recent.length) {
            const msg = recent[i];
            if (msg.role === 'assistant' && msg.tool_calls && msg.tool_calls.length > 0) {
                const expectedIds = new Set(msg.tool_calls.map(tc => tc.id));
                const foundIds = new Set();
                let j = i + 1;
                while (j < recent.length && recent[j].role === 'tool') {
                    foundIds.add(recent[j].tool_call_id);
                    j++;
                }

                const missingIds = [...expectedIds].filter(id => !foundIds.has(id));

                if (missingIds.length === 0) {
                    sanitizedRecent.push(msg);
                    i++;
                } else {
                    console.log(chalk.yellow(`⚠️  Removing broken tool call chain (Assistant msg ${i}). Missing IDs: ${missingIds.join(', ')}`));
                    let k = i + 1;
                    while (k < recent.length && recent[k].role === 'tool') {
                        k++;
                    }
                    i = k;
                }
            } else {
                sanitizedRecent.push(msg);
                i++;
            }
        }

        return [...systemMessages, ...sanitizedRecent];
    }

    async _maybeSummarizeHistory() {
        const maxMessagesBeforeSummary = 200;
        if (this._hasSummary) return;
        if (this.memory.length <= maxMessagesBeforeSummary) return;
        try {
            await this._summarizeHistory();
        } catch (e) {
            console.error('Failed to summarize history:', e);
            try {
                await sendTelegramMessage(`Agent ${this.id} failed to summarize history: ${e.message || e}`);
            } catch { }
        }
    }

    async _summarizeHistory() {
        const systemMessages = this.memory.filter(m => m.role === 'system');
        const nonSystem = this.memory.filter(m => m.role !== 'system');
        const keepRecentCount = 30;
        const oldPart = nonSystem.slice(0, Math.max(0, nonSystem.length - keepRecentCount));
        if (oldPart.length === 0) return;

        let serialized = JSON.stringify(oldPart);
        const maxSummaryChars = 20000;
        if (serialized.length > maxSummaryChars) {
            serialized = serialized.slice(0, maxSummaryChars) + '... [truncated]';
        }

        const summaryMessages = [];
        if (systemMessages.length > 0) {
            summaryMessages.push(systemMessages[0]);
        }
        summaryMessages.push({
            role: 'user',
            content: 'Summarize the following conversation so far in 1-2 paragraphs focusing on the main tasks, decisions, and important files. Do not include any tool call JSON or code blocks. Conversation:\n' + serialized
        });

        const summaryResponse = await this.provider.chat(summaryMessages, []);
        const summaryText = summaryResponse && summaryResponse.content ? summaryResponse.content : '';

        const recentPart = nonSystem.slice(-keepRecentCount);
        const newMemory = [];
        if (systemMessages.length > 0) {
            newMemory.push(systemMessages[0]);
        }
        newMemory.push({
            role: 'assistant',
            content: 'Summary of previous conversation:\n' + summaryText
        });
        newMemory.push(...recentPart);
        this.memory = newMemory;
        this._hasSummary = true;
    }

    async researchDirectory(dirPath) {
        const files = await listFiles(`${dirPath}/**/*`);
        let summary = `Directory listing for ${dirPath}:\n`;

        // Strategy: List all files, then read only a small set of relevant text files.

        summary += files.join('\n');
        summary += '\n\nSelected File Contents:\n';

        let fileCount = 0;
        for (const file of files) {
            if (fileCount >= 5) break; // Limit to 5 files for now
            // Skip lock files, images, etc.
            if (file.endsWith('.json') || file.endsWith('.js') || file.endsWith('.md') || file.endsWith('.html') || file.endsWith('.css')) {
                try {
                    const content = await readFile(file);
                    summary += `\n--- File: ${file} ---\n${content}\n`;
                    fileCount++;
                } catch (e) {
                    // ignore read errors
                }
            }
        }

        const prompt = `
I have investigated the directory "${dirPath}".
Here is the summary of the files and contents:
\`\`\`
${summary}
\`\`\`

Please analyze this project structure and content. Explain what it is and remember this context for future questions.
`;

        // We treat this as a user message (or system observation)
        return await this.chat(prompt);
    }

    async analyzeFile(filePath, question) {
        const content = await readFile(filePath);
        const prompt = `
File: ${filePath}
Content:
\`\`\`
${content}
\`\`\`

User Question: ${question || 'Summarize this file and explain what it does.'}
`;
        return await this.provider.generate(prompt);
    }

    async updateModel(modelId) {
        if (this.provider && this.provider.model !== modelId) {
            console.log(chalk.blue(`Switching agent ${this.id} model to ${modelId}`));
            this.provider.model = modelId;
            // Note: If switching between providers (OpenAI <-> Gemini) is needed, 
            // we would need to recreate the provider here. 
            // For now, assuming model string update is sufficient for same-provider or compatible.
        }
    }

    async updateFile(filePath, instruction) {
        const content = await readFile(filePath);
        const prompt = `
You are an expert software engineer.
File: ${filePath}
Content:
\`\`\`
${content}
\`\`\`

Instruction: ${instruction}

Output ONLY the updated file content. Do not include markdown code blocks (like \`\`\`javascript) or explanations. Just the raw code.
`;
        const newContent = await this.provider.generate(prompt);
        const cleanedContent = newContent.replace(/^```[a-z]*\n/i, '').replace(/\n```$/, '');

        return cleanedContent;
    }

    async fixFile(filePath, errorContext = '') {
        const content = await readFile(filePath);
        const prompt = `
You are an expert software engineer.
File: ${filePath}
Content:
\`\`\`
${content}
\`\`\`

${errorContext ? `Error Context:\n${errorContext}` : 'Identify potential bugs or issues in this code and fix them.'}

Output ONLY the fixed file content. Do not include markdown code blocks or explanations.
`;
        const newContent = await this.provider.generate(prompt);
        const cleanedContent = newContent.replace(/^```[a-z]*\n/i, '').replace(/\n```$/, '');
        return cleanedContent;
    }

    async generateCommand(instruction) {
        const prompt = `
You are a CLI expert.
User Instruction: ${instruction}

Return a single line shell command (or a chain of commands with &&) to accomplish this task on Windows.
Do NOT output markdown blocks. Output ONLY the command.
`;
        const command = await this.provider.generate(prompt);
        return command.trim();
    }
}
