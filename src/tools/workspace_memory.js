import { appendLearning, appendError, updatePersistentMemory, appendDailyMemory } from '../memory/workspace.js';

/**
 * Workspace Memory Tools
 * These allow the agent to log learnings, errors, and persistent facts
 * to the file-based workspace knowledge system.
 */
const workspaceMemoryTools = {
    // Log a learning to the workspace .learnings/LEARNINGS.md
    workspace_log_learning: async ({ content }) => {
        try {
            appendLearning(content);
            return `Learning logged: "${content.substring(0, 80)}..."`;
        } catch (e) {
            return `Error logging learning: ${e.message}`;
        }
    },

    // Log an error pattern to .learnings/ERRORS.md
    workspace_log_error: async ({ error, solution }) => {
        try {
            appendError(error, solution || '');
            return `Error pattern logged: "${error.substring(0, 80)}..."`;
        } catch (e) {
            return `Error logging error: ${e.message}`;
        }
    },

    // Save a persistent fact to MEMORY.md under a section
    workspace_save_fact: async ({ section, fact }) => {
        try {
            updatePersistentMemory(section, fact);
            return `Fact saved to [${section}]: "${fact.substring(0, 80)}..."`;
        } catch (e) {
            return `Error saving fact: ${e.message}`;
        }
    },

    // Log something to today's daily session memory
    workspace_daily_log: async ({ content }) => {
        try {
            appendDailyMemory(content);
            return `Daily log entry added.`;
        } catch (e) {
            return `Error adding daily log: ${e.message}`;
        }
    }
};

export const workspaceToolDefinitions = [
    {
        name: 'workspace_log_learning',
        description: 'Log a useful learning or insight to persistent workspace memory. Use this when you discover something valuable about the project, a library, or a pattern.',
        parameters: {
            type: 'object',
            properties: {
                content: { type: 'string', description: 'The learning to log (e.g., "React project uses TypeScript with strict mode").' }
            },
            required: ['content']
        }
    },
    {
        name: 'workspace_log_error',
        description: 'Log a recurring error pattern and its solution. Helps avoid repeating the same mistakes.',
        parameters: {
            type: 'object',
            properties: {
                error: { type: 'string', description: 'Description of the error or problem.' },
                solution: { type: 'string', description: 'How it was fixed (optional).' }
            },
            required: ['error']
        }
    },
    {
        name: 'workspace_save_fact',
        description: 'Save an important, persistent fact about the project or user preferences. This will be automatically loaded into context in future sessions.',
        parameters: {
            type: 'object',
            properties: {
                section: { type: 'string', description: "Section in MEMORY.md (e.g., 'Project Facts', 'User Preferences', 'Architecture Notes')." },
                fact: { type: 'string', description: 'The fact to save.' }
            },
            required: ['section', 'fact']
        }
    },
    {
        name: 'workspace_daily_log',
        description: 'Add an entry to today\'s session log. Use for tracking progress on long-running tasks.',
        parameters: {
            type: 'object',
            properties: {
                content: { type: 'string', description: 'Log entry content.' }
            },
            required: ['content']
        }
    }
];

export { workspaceMemoryTools };
