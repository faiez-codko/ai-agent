import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { toolDefinitions } from '../tools/index.js';

const SKILLS_DIR = path.join(os.homedir(), '.agent', 'skills');

const DEFAULT_PROMPT = `You are Polly, an autonomous AI Agent and orchestrator. You manage tasks, delegate to specialist agents when appropriate, and handle general work yourself.

## YOUR ROLE
You are the PRIMARY agent. The user talks to YOU. You can:
1. Handle tasks directly (coding, file ops, commands, browsing, database, etc.)
2. Delegate specialized work to sub-agents using the 'delegate_task' tool

## AVAILABLE SPECIALIST AGENTS
 ~ note check for available agents

## DELEGATION RULES
1. Delegate when a task clearly matches a specialist's expertise AND is complex enough to warrant it.
2. For simple tasks (read a file, run a command, quick code fix), do it yourself — don't over-delegate.
3. Provide COMPLETE context when delegating: file paths, requirements, constraints, expected output.
4. REVIEW the delegate's result before reporting to the user.
5. You can chain delegations — e.g., delegate scraping to \`scraper\`, then have \`coder\` process the data.

## MCP TOOLS (MODEL CONTEXT PROTOCOL)
1. If a task needs external integrations, call \`mcp_list_tools\` to discover available MCP tools.
2. Use \`mcp_call_tool\` to execute MCP tools with validated payloads.
3. Prefer MCP tools when they provide safer or more direct access than shell commands.
4. If another agent should handle the task, use \`delegate_task\` with clear instructions.

## CONTEXT MANAGEMENT (CRITICAL)
1. MINIMIZE TOOL CALLS. Plan your approach BEFORE calling tools.
2. After every 3-5 tool calls, PAUSE and re-state what you're trying to accomplish.
3. When you see a [TASK ANCHOR] message, that is your CURRENT GOAL. Stay focused on it.
4. If a tool output says 'Full output stored in SQLite', use \`read_tool_output\` with the given ID if you need the complete data.

## WORKSPACE MEMORY — MANDATORY SAVES
You MUST update workspace memory in these situations:
1. **After completing a task**: Call \`workspace_save_fact\` with section 'Project Facts' to save what you learned about the project (tech stack, structure, important files).
2. **After discovering a user preference**: Call \`workspace_save_fact\` with section 'User Preferences' (e.g., coding style, preferred tools, naming conventions).
3. **After solving a tricky bug**: Call \`workspace_log_error\` with the error description and solution so you don't repeat it.
4. **After learning something useful**: Call \`workspace_log_learning\` with the insight.
5. **At the START of a task**: Call \`memory_search\` to check if you've worked on this project before.

Examples of WHEN to save:
- You discover the project uses Next.js → workspace_save_fact('Project Facts', 'This project uses Next.js 14 with App Router')
- User says they prefer tabs → workspace_save_fact('User Preferences', 'User prefers tabs over spaces')
- You fix a CORS error → workspace_log_error('CORS error on API route /api/data', 'Added Access-Control-Allow-Origin header in middleware')

## CREDENTIAL HANDLING & SECURITY
1. AUTHORIZED to use credentials provided by the user.
2. Do NOT leak credentials in text responses.

ALWAYS use tools. Do not hallucinate. Clean up temporary scripts after use.`;

async function ensureSkillsDir() {
    try {
        await fs.mkdir(SKILLS_DIR, { recursive: true });
        const defaultPath = path.join(SKILLS_DIR, 'default.md');
        try {
            await fs.access(defaultPath);
        } catch {
            await fs.writeFile(defaultPath, DEFAULT_PROMPT);
        }
    } catch (e) {
        console.error("Failed to ensure skills directory:", e);
    }
}

export async function loadPersona(personaId) {
    await ensureSkillsDir();
    const skillId = personaId;
    const filePath = path.join(SKILLS_DIR, `${skillId}.md`);
    
    try {
        const content = await fs.readFile(filePath, 'utf-8');
        return {
            id: skillId,
            name: skillId,
            description: `Skill: ${skillId}`,
            systemPrompt: content,
            allowedTools: toolDefinitions.map(t => t.name)
        };
    } catch (error) {
        if (skillId !== 'default') {
            console.warn(`Skill ${skillId} not found, loading default.`);
            return loadPersona('default');
        }
        throw new Error(`Critical: Default skill not found at ${filePath}`);
    }
}

export async function listPersonas() {
    await ensureSkillsDir();
    try {
        const files = await fs.readdir(SKILLS_DIR);
        return files
            .filter(f => f.endsWith('.md'))
            .map(f => {
                const id = f.replace('.md', '');
                return {
                    id,
                    name: id,
                    description: 'Skill'
                };
            });
    } catch {
        return [];
    }
}

export async function savePersona(persona) {
    await ensureSkillsDir();
    const filePath = path.join(SKILLS_DIR, `${persona.id}.md`);
    await fs.writeFile(filePath, persona.systemPrompt);
    return persona;
}

function parseGithubRepoUrl(url) {
    try {
        const parsed = new URL(url);
        if (!/^(www\.)?github\.com$/i.test(parsed.hostname)) return null;
        const parts = parsed.pathname.split('/').filter(Boolean);
        if (parts.length < 2) return null;
        return {
            owner: parts[0],
            repo: parts[1].replace(/\.git$/i, '')
        };
    } catch {
        return null;
    }
}

async function fetchTextFromUrl(url) {
    const response = await fetch(url);
    if (!response.ok) {
        throw new Error(`Failed to fetch URL: ${response.status} ${response.statusText}`);
    }
    return response.text();
}

async function fetchSkillFromGithubRepo(repoUrl, skillName) {
    const repo = parseGithubRepoUrl(repoUrl);
    if (!repo) return null;

    const normalized = normalizeSkillId(skillName);
    if (!normalized) {
        throw new Error(`Invalid skill name: ${skillName}`);
    }

    const branchNames = ['main', 'master', 'refs/heads/main', 'refs/heads/master'];
    const skillDirs = [normalized, skillName];
    const relativePaths = [];

    for (const dir of skillDirs) {
        relativePaths.push(`${dir}/SKILL.md`);
        relativePaths.push(`skills/${dir}/SKILL.md`);
        relativePaths.push(`.claude/skills/${dir}/SKILL.md`);
        relativePaths.push(`${dir}.md`);
        relativePaths.push(`skills/${dir}.md`);
        relativePaths.push(`.claude/skills/${dir}.md`);
    }

    const candidates = [];
    for (const branch of branchNames) {
        for (const rel of relativePaths) {
            candidates.push(`https://raw.githubusercontent.com/${repo.owner}/${repo.repo}/${branch}/${rel}`);
        }
    }

    const errors = [];
    for (const candidate of candidates) {
        try {
            const content = await fetchTextFromUrl(candidate);
            return { content, resolvedUrl: candidate };
        } catch (error) {
            errors.push(error.message);
        }
    }

    throw new Error(`Could not find skill '${skillName}' in GitHub repo ${repo.owner}/${repo.repo}`);
}

export async function addSkillFromUrl(url, name) {
    await ensureSkillsDir();
    try {
        let content;
        const repoResult = await fetchSkillFromGithubRepo(url, name);
        if (repoResult) {
            console.log(`Fetching skill '${name}' from GitHub repo: ${repoResult.resolvedUrl}...`);
            content = repoResult.content;
        } else {
            console.log(`Fetching skill from ${url}...`);
            content = await fetchTextFromUrl(url);
        }
        
        // Basic check: if it's a GitHub repo URL (not raw), warn the user or try to fetch raw?
        // For now, just save the content.
        
        await savePersona({ id: name, systemPrompt: content });
        return { id: name, size: content.length };
    } catch (error) {
        throw new Error(`Failed to add skill: ${error.message}`);
    }
}

function normalizeSkillId(raw) {
    return raw
        .toLowerCase()
        .trim()
        .replace(/\s+/g, '-')
        .replace(/[^a-z0-9-_]/g, '');
}

async function addSkillFromFile(filePath, name) {
    const content = await fs.readFile(filePath, 'utf-8');
    const skillId = normalizeSkillId(name || path.basename(filePath, path.extname(filePath)));
    if (!skillId) {
        throw new Error(`Invalid skill name derived from file: ${filePath}`);
    }
    await savePersona({ id: skillId, systemPrompt: content });
    return { id: skillId, size: content.length, source: filePath };
}

async function addSkillsFromFolder(folderPath) {
    const entries = await fs.readdir(folderPath, { withFileTypes: true });
    const imported = [];

    const folderSkillFile = path.join(folderPath, 'SKILL.md');
    try {
        const stat = await fs.stat(folderSkillFile);
        if (stat.isFile()) {
            imported.push(await addSkillFromFile(folderSkillFile, path.basename(folderPath)));
        }
    } catch {
        // Ignore if the folder has no top-level SKILL.md
    }

    for (const entry of entries) {
        if (entry.isDirectory()) {
            const subSkillPath = path.join(folderPath, entry.name, 'SKILL.md');
            try {
                const stat = await fs.stat(subSkillPath);
                if (stat.isFile()) {
                    imported.push(await addSkillFromFile(subSkillPath, entry.name));
                }
            } catch {
                // Ignore non-skill directories
            }
        } else if (entry.isFile() && entry.name.toLowerCase().endsWith('.md') && entry.name !== 'SKILL.md') {
            imported.push(await addSkillFromFile(path.join(folderPath, entry.name)));
        }
    }

    if (imported.length === 0) {
        throw new Error(`No skill files found in folder: ${folderPath}`);
    }

    return imported;
}

export async function addSkillFromSource(source, name) {
    await ensureSkillsDir();
    const isUrl = /^https?:\/\//i.test(source);
    if (isUrl) {
        if (!name) {
            throw new Error('--skill <name> is required when adding from a URL');
        }
        const result = await addSkillFromUrl(source, name);
        return { mode: 'single', imported: [result] };
    }

    const resolved = path.resolve(process.cwd(), source);
    let stat;
    try {
        stat = await fs.stat(resolved);
    } catch {
        throw new Error(`Source not found: ${resolved}`);
    }

    if (stat.isFile()) {
        const result = await addSkillFromFile(resolved, name);
        return { mode: 'single', imported: [result] };
    }

    if (stat.isDirectory()) {
        const imported = await addSkillsFromFolder(resolved);
        return { mode: 'folder', imported };
    }

    throw new Error(`Unsupported source type: ${resolved}`);
}
