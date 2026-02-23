import fs from 'fs';
import path from 'path';
import os from 'os';

const WORKSPACE_DIR = path.join(os.homedir(), '.agent', 'workspace');
const SKILLS_DIR = path.join(os.homedir(), '.agent', 'skills');

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

    const files = ['SOUL.md', 'TOOLS.md', 'AGENTS.md'];
    const sections = [];

    for (const filename of files) {
        const filePath = path.join(WORKSPACE_DIR, filename);
        try {
            let content = fs.readFileSync(filePath, 'utf-8');

            // Dynamically append available skills to AGENTS.md
            if (filename === 'AGENTS.md') {
                try {
                    if (fs.existsSync(SKILLS_DIR)) {
                        const skills = fs.readdirSync(SKILLS_DIR)
                            .filter(f => f.endsWith('.md') && f !== 'default.md')
                            .map(f => f.replace('.md', ''));
                        
                        if (skills.length > 0) {
                            content += `\n\n## Discovered Skills (Available for Delegation)\n`;
                            content += skills.map(s => `- \`${s}\``).join('\n');
                        }
                    }
                } catch (e) {
                    // Ignore skill reading errors
                }
            }

            // Only include if file has meaningful content (not just headers)
            const stripped = content.replace(/^#.*$/gm, '').replace(/\s+/g, '').trim();
            if (stripped.length > 20) {
                sections.push(`--- ${filename} ---\n${content.trim()}`);
            }
        } catch (e) {
            // Ignore missing files
        }
    }

    return sections.join('\n\n');
}

export { WORKSPACE_DIR, ensureWorkspace };
