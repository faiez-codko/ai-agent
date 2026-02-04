import { execa } from 'execa';

async function runGh(args) {
    try {
        const { stdout } = await execa('gh', args);
        return stdout;
    } catch (error) {
        throw new Error(`gh command failed: ${error.stderr || error.message}`);
    }
}

export const ghTools = {
    gh_issue_create: async ({ repo, title, body }) => {
        // repo format: owner/repo
        try {
            const args = ['issue', 'create', '--repo', repo, '--title', title, '--body', body];
            const result = await runGh(args);
            return `Issue created: ${result.trim()}`;
        } catch (error) {
            return `Error creating issue: ${error.message}`;
        }
    },

    gh_issue_list: async ({ repo, state = 'open', limit = 30 }) => {
        try {
            const args = ['issue', 'list', '--repo', repo, '--state', state, '--limit', String(limit)];
            const result = await runGh(args);
            return result || 'No issues found.';
        } catch (error) {
            return `Error listing issues: ${error.message}`;
        }
    },

    gh_pr_create: async ({ repo, title, body, head, base }) => {
        try {
            const args = ['pr', 'create', '--repo', repo, '--title', title, '--body', body, '--head', head, '--base', base];
            const result = await runGh(args);
            return `PR created: ${result.trim()}`;
        } catch (error) {
            return `Error creating PR: ${error.message}`;
        }
    },

    gh_pr_list: async ({ repo, state = 'open', limit = 30 }) => {
        try {
            const args = ['pr', 'list', '--repo', repo, '--state', state, '--limit', String(limit)];
            const result = await runGh(args);
            return result || 'No PRs found.';
        } catch (error) {
            return `Error listing PRs: ${error.message}`;
        }
    },

    gh_file_content: async ({ repo, path }) => {
        try {
            // Use gh api to get file content
            // GET /repos/{owner}/{repo}/contents/{path}
            const args = ['api', `repos/${repo}/contents/${path}`, '--jq', '.content'];
            const base64Content = await runGh(args);
            const content = Buffer.from(base64Content.trim(), 'base64').toString('utf-8');
            return content;
        } catch (error) {
            // Check if it's a directory
            try {
                 const dirArgs = ['api', `repos/${repo}/contents/${path}`, '--jq', 'map(.name) | join(", ")'];
                 const dirList = await runGh(dirArgs);
                 if (dirList) return `Directory listing: ${dirList}`;
            } catch (ignore) {}

            return `Error getting file content: ${error.message}`;
        }
    }
};

export const ghToolDefinitions = [
    {
        name: "gh_issue_create",
        description: "Create a new issue on GitHub using gh CLI.",
        parameters: {
            type: "object",
            properties: {
                repo: { type: "string", description: "Repository in 'owner/repo' format" },
                title: { type: "string", description: "Issue title" },
                body: { type: "string", description: "Issue body" }
            },
            required: ["repo", "title", "body"]
        }
    },
    {
        name: "gh_issue_list",
        description: "List issues for a repository using gh CLI.",
        parameters: {
            type: "object",
            properties: {
                repo: { type: "string", description: "Repository in 'owner/repo' format" },
                state: { type: "string", description: "Issue state (open, closed, all)", enum: ["open", "closed", "all"] },
                limit: { type: "integer", description: "Max number of issues to list" }
            },
            required: ["repo"]
        }
    },
    {
        name: "gh_pr_create",
        description: "Create a pull request using gh CLI.",
        parameters: {
            type: "object",
            properties: {
                repo: { type: "string", description: "Repository in 'owner/repo' format" },
                title: { type: "string", description: "PR title" },
                body: { type: "string", description: "PR body" },
                head: { type: "string", description: "Head branch" },
                base: { type: "string", description: "Base branch" }
            },
            required: ["repo", "title", "head", "base"]
        }
    },
    {
        name: "gh_pr_list",
        description: "List pull requests using gh CLI.",
        parameters: {
            type: "object",
            properties: {
                repo: { type: "string", description: "Repository in 'owner/repo' format" },
                state: { type: "string", description: "PR state (open, closed, all)", enum: ["open", "closed", "all"] },
                limit: { type: "integer", description: "Max number of PRs to list" }
            },
            required: ["repo"]
        }
    },
    {
        name: "gh_file_content",
        description: "Get file content from GitHub using gh CLI.",
        parameters: {
            type: "object",
            properties: {
                repo: { type: "string", description: "Repository in 'owner/repo' format" },
                path: { type: "string", description: "File path" }
            },
            required: ["repo", "path"]
        }
    }
];
