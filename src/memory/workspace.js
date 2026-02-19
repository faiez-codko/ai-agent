import fs from 'fs';
import path from 'path';
import os from 'os';

const WORKSPACE_DIR = path.join(os.homedir(), '.agent', 'workspace');

// Ensure workspace structure exists
function ensureWorkspace() {
    const dirs = [
        WORKSPACE_DIR,
        path.join(WORKSPACE_DIR, 'memory'),
        path.join(WORKSPACE_DIR, '.learnings'),
    ];
    for (const dir of dirs) {
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
    }

    // Create default files if they don't exist
    const defaults = {
        'SOUL.md': `# Agent Soul
## Identity
You are a focused, task-oriented AI agent. You execute tasks efficiently with minimal unnecessary steps.

## Core Principles
1. **Task Focus**: Always re-read the current task goal before each action. Never drift.
2. **Minimal Tool Calls**: Plan your approach BEFORE calling tools. Batch reads when possible.
3. **Verify Before Acting**: Read a file before modifying it. Check directory structure before navigating.
4. **Fail Fast**: If a tool returns an error, analyze and fix immediately — don't retry blindly.
5. **Communicate Progress**: After completing a sub-task, summarize what was done before moving on.

## Anti-Patterns (DO NOT DO)
- Do NOT explore directories aimlessly. Know what you're looking for.
- Do NOT re-read files you've already read in this conversation.
- Do NOT make tool calls just to "check" something you already know.
- Do NOT output tool call JSON in your text response — use the native tool calling mechanism.
- Do NOT lose track of the original request. Re-state the goal every 5 steps.
`,
        'TOOLS.md': `# Tool Usage Guide

## File Operations
- \`read_file\`: Always check if you already have the content in context before reading again.
- \`write_file\`: Use for new files. For edits, prefer \`update_file\` to avoid rewriting everything.
- \`update_file\`: Provide EXACT search_text. If it fails, re-read the file first.
- \`read_dir\`: Use before \`list_files\` — it's lighter. Only use \`list_files\` for deep searches.

## Command Execution
- \`run_command\`: Always use && to chain commands. Check the output before proceeding.
- Prefer \`run_command\` with "type" or "cat" over \`read_file\` for quick peeks at small files.

## Browser
- \`browser_visit\` returns full page text — can be VERY large. Use \`browser_search\` first to find the right URL.
- \`browser_eval\` runs JS on the page. Use it to extract specific data after visiting.

## Memory Tools
- \`memory_save\`: Save IMPORTANT facts only. Don't save temporary data.
- \`memory_search\`: ALWAYS search memory at the start of a new task for relevant context.
- Categories: 'project', 'preferences', 'architecture', 'bugs', 'general'

## Common Mistakes
- Calling \`list_files\` on root directory → huge output, wastes context
- Reading node_modules or lock files → useless, bloats context
- Forgetting to check command exit codes
- Making changes without reading the file first
`,
        'AGENTS.md': `# Multi-Agent System

## Available Specialist Agents
- \`scraper\` (Web Scraping Expert): Web scraping, data extraction, site audits, browser automation
- \`coder\` (Coding Expert): Complex coding tasks, refactoring, debugging, architecture design
- \`leadgen\` (B2B Lead Generation Expert): Prospect research, contact scraping, list building, outreach prep

## Delegation Guide
Use \`delegate_task\` with the agent name:
- delegate_task({ target_agent_id: "scraper", instruction: "Scrape all product prices from ..." })
- delegate_task({ target_agent_id: "coder", instruction: "Refactor the auth module to ..." })
- delegate_task({ target_agent_id: "leadgen", instruction: "Find 50 SaaS companies in ..." })

## Rules
1. Delegate when the task clearly matches a specialist's expertise.
2. For simple tasks, handle them directly — don't over-delegate.
3. Provide COMPLETE context when delegating.
4. Review results before reporting to the user.
`,
        'MEMORY.md': `# Long-Term Memory

## Project Facts
(Agent will populate this with learned project details)

## User Preferences
(Agent will populate this with user preferences)

## Architecture Notes
(Agent will populate this with architecture decisions)
`,
        '.learnings/LEARNINGS.md': `# Learnings Log
<!-- Agent appends lessons learned here -->
`,
        '.learnings/ERRORS.md': `# Error Patterns
<!-- Agent logs recurring errors and their solutions here -->
`,
        '.learnings/FEATURE_REQUESTS.md': `# Feature Requests
<!-- Agent logs user feature requests here -->
`
    };

    for (const [filename, content] of Object.entries(defaults)) {
        const filePath = path.join(WORKSPACE_DIR, filename);
        if (!fs.existsSync(filePath)) {
            fs.writeFileSync(filePath, content);
        }
    }
}

/**
 * Load workspace knowledge files and return them as structured context.
 * This is injected into the system prompt to give the agent persistent identity and knowledge.
 */
export function loadWorkspaceContext() {
    ensureWorkspace();

    const files = ['SOUL.md', 'TOOLS.md', 'AGENTS.md', 'MEMORY.md'];
    const sections = [];

    for (const filename of files) {
        const filePath = path.join(WORKSPACE_DIR, filename);
        try {
            const content = fs.readFileSync(filePath, 'utf-8');
            // Only include if file has meaningful content (not just headers)
            const stripped = content.replace(/^#.*$/gm, '').replace(/\s+/g, '').trim();
            if (stripped.length > 20) {
                sections.push(`--- ${filename} ---\n${content.trim()}`);
            }
        } catch (e) {
            // Ignore missing files
        }
    }

    // Load today's daily memory if it exists
    const today = new Date().toISOString().split('T')[0];
    const dailyPath = path.join(WORKSPACE_DIR, 'memory', `${today}.md`);
    try {
        if (fs.existsSync(dailyPath)) {
            const dailyContent = fs.readFileSync(dailyPath, 'utf-8');
            if (dailyContent.trim().length > 10) {
                sections.push(`--- Today's Session Memory (${today}) ---\n${dailyContent.trim()}`);
            }
        }
    } catch (e) {
        // Ignore
    }

    // Load recent learnings (last 20 lines)
    const learningsPath = path.join(WORKSPACE_DIR, '.learnings', 'LEARNINGS.md');
    try {
        if (fs.existsSync(learningsPath)) {
            const lines = fs.readFileSync(learningsPath, 'utf-8').split('\n');
            const recent = lines.slice(-20).join('\n').trim();
            if (recent.length > 10) {
                sections.push(`--- Recent Learnings ---\n${recent}`);
            }
        }
    } catch (e) {
        // Ignore
    }

    return sections.join('\n\n');
}

/**
 * Append to today's daily memory file.
 * Used to log important session events that should persist to the next conversation.
 */
export function appendDailyMemory(content) {
    ensureWorkspace();
    const today = new Date().toISOString().split('T')[0];
    const dailyPath = path.join(WORKSPACE_DIR, 'memory', `${today}.md`);

    const timestamp = new Date().toLocaleTimeString();
    const entry = `\n[${timestamp}] ${content}\n`;

    fs.appendFileSync(dailyPath, entry);
}

/**
 * Append to learnings file.
 */
export function appendLearning(content) {
    ensureWorkspace();
    const learningsPath = path.join(WORKSPACE_DIR, '.learnings', 'LEARNINGS.md');
    const timestamp = new Date().toISOString().split('T')[0];
    const entry = `\n- [${timestamp}] ${content}`;
    fs.appendFileSync(learningsPath, entry);
}

/**
 * Append to errors file.
 */
export function appendError(errorDesc, solution = '') {
    ensureWorkspace();
    const errorsPath = path.join(WORKSPACE_DIR, '.learnings', 'ERRORS.md');
    const timestamp = new Date().toISOString().split('T')[0];
    let entry = `\n### [${timestamp}] ${errorDesc}`;
    if (solution) {
        entry += `\n**Solution**: ${solution}`;
    }
    fs.appendFileSync(errorsPath, entry);
}

/**
 * Update the MEMORY.md file with new persistent facts.
 * This should be called when the agent learns something important about the project.
 */
export function updatePersistentMemory(section, content) {
    ensureWorkspace();
    const memoryPath = path.join(WORKSPACE_DIR, 'MEMORY.md');

    let existing = '';
    try {
        existing = fs.readFileSync(memoryPath, 'utf-8');
    } catch (e) {
        existing = '# Long-Term Memory\n';
    }

    // Append under the appropriate section
    const sectionHeader = `## ${section}`;
    if (existing.includes(sectionHeader)) {
        // Append after the section header
        const idx = existing.indexOf(sectionHeader);
        const nextSection = existing.indexOf('\n## ', idx + sectionHeader.length);
        const insertPoint = nextSection !== -1 ? nextSection : existing.length;
        existing = existing.slice(0, insertPoint) + `\n- ${content}` + existing.slice(insertPoint);
    } else {
        // Add new section
        existing += `\n\n${sectionHeader}\n- ${content}`;
    }

    fs.writeFileSync(memoryPath, existing);
}

/**
 * Clean up old daily memory files (keep last 7 days).
 */
export function pruneOldDailyMemory(keepDays = 7) {
    ensureWorkspace();
    const memoryDir = path.join(WORKSPACE_DIR, 'memory');

    try {
        const files = fs.readdirSync(memoryDir).filter(f => f.endsWith('.md'));
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - keepDays);

        for (const file of files) {
            const dateStr = file.replace('.md', '');
            const fileDate = new Date(dateStr);
            if (!isNaN(fileDate.getTime()) && fileDate < cutoffDate) {
                fs.unlinkSync(path.join(memoryDir, file));
            }
        }
    } catch (e) {
        // Ignore cleanup errors
    }
}

export { WORKSPACE_DIR, ensureWorkspace };
