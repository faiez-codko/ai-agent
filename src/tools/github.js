import { Octokit } from "octokit";
import { getGitHubToken } from "../config.js";

let octokitInstance = null;

async function getOctokit() {
    if (octokitInstance) return octokitInstance;

    const token = await getGitHubToken();
    if (!token) {
        throw new Error("GitHub token not found. Please set GITHUB_TOKEN in env or github_token in config.");
    }

    octokitInstance = new Octokit({ auth: token });
    return octokitInstance;
}

export const githubTools = {
    github_create_issue: async ({ owner, repo, title, body }) => {
        try {
            const octokit = await getOctokit();
            const response = await octokit.rest.issues.create({
                owner,
                repo,
                title,
                body
            });
            return `Issue created: ${response.data.html_url}`;
        } catch (error) {
            return `Error creating issue: ${error.message}`;
        }
    },

    github_list_issues: async ({ owner, repo, state = 'open' }) => {
        try {
            const octokit = await getOctokit();
            const response = await octokit.rest.issues.listForRepo({
                owner,
                repo,
                state
            });
            return response.data.map(issue => 
                `#${issue.number} ${issue.title} (${issue.html_url})`
            ).join('\n');
        } catch (error) {
            return `Error listing issues: ${error.message}`;
        }
    },

    github_create_pr: async ({ owner, repo, title, head, base, body }) => {
        try {
            const octokit = await getOctokit();
            const response = await octokit.rest.pulls.create({
                owner,
                repo,
                title,
                head,
                base,
                body
            });
            return `PR created: ${response.data.html_url}`;
        } catch (error) {
            return `Error creating PR: ${error.message}`;
        }
    },

    github_list_prs: async ({ owner, repo, state = 'open' }) => {
        try {
            const octokit = await getOctokit();
            const response = await octokit.rest.pulls.list({
                owner,
                repo,
                state
            });
            return response.data.map(pr => 
                `#${pr.number} ${pr.title} (${pr.html_url})`
            ).join('\n');
        } catch (error) {
            return `Error listing PRs: ${error.message}`;
        }
    },

    github_get_file_content: async ({ owner, repo, path }) => {
        try {
            const octokit = await getOctokit();
            const response = await octokit.rest.repos.getContent({
                owner,
                repo,
                path
            });
            
            if (Array.isArray(response.data)) {
                return `Directory listing: ${response.data.map(f => f.name).join(', ')}`;
            }

            const content = Buffer.from(response.data.content, 'base64').toString('utf-8');
            return content;
        } catch (error) {
            return `Error getting file content: ${error.message}`;
        }
    },
    
    github_search_issues: async ({ query }) => {
        try {
            const octokit = await getOctokit();
            const response = await octokit.rest.search.issuesAndPullRequests({
                q: query
            });
            return response.data.items.map(item => 
                `[${item.state}] ${item.title} (${item.html_url})`
            ).join('\n');
        } catch (error) {
            return `Error searching issues: ${error.message}`;
        }
    }
};

export const githubToolDefinitions = [
    {
        name: "github_create_issue",
        description: "Create a new issue on GitHub.",
        parameters: {
            type: "object",
            properties: {
                owner: { type: "string", description: "Repository owner" },
                repo: { type: "string", description: "Repository name" },
                title: { type: "string", description: "Issue title" },
                body: { type: "string", description: "Issue body" }
            },
            required: ["owner", "repo", "title"]
        }
    },
    {
        name: "github_list_issues",
        description: "List issues for a repository.",
        parameters: {
            type: "object",
            properties: {
                owner: { type: "string", description: "Repository owner" },
                repo: { type: "string", description: "Repository name" },
                state: { type: "string", description: "Issue state (open, closed, all)", enum: ["open", "closed", "all"] }
            },
            required: ["owner", "repo"]
        }
    },
    {
        name: "github_create_pr",
        description: "Create a pull request.",
        parameters: {
            type: "object",
            properties: {
                owner: { type: "string", description: "Repository owner" },
                repo: { type: "string", description: "Repository name" },
                title: { type: "string", description: "PR title" },
                head: { type: "string", description: "The name of the branch where your changes are implemented." },
                base: { type: "string", description: "The name of the branch you want the changes pulled into." },
                body: { type: "string", description: "PR body" }
            },
            required: ["owner", "repo", "title", "head", "base"]
        }
    },
    {
        name: "github_list_prs",
        description: "List pull requests.",
        parameters: {
            type: "object",
            properties: {
                owner: { type: "string", description: "Repository owner" },
                repo: { type: "string", description: "Repository name" },
                state: { type: "string", description: "PR state (open, closed, all)", enum: ["open", "closed", "all"] }
            },
            required: ["owner", "repo"]
        }
    },
    {
        name: "github_get_file_content",
        description: "Get the content of a file from a GitHub repository.",
        parameters: {
            type: "object",
            properties: {
                owner: { type: "string", description: "Repository owner" },
                repo: { type: "string", description: "Repository name" },
                path: { type: "string", description: "Path to the file" }
            },
            required: ["owner", "repo", "path"]
        }
    },
    {
        name: "github_search_issues",
        description: "Search for issues and pull requests.",
        parameters: {
            type: "object",
            properties: {
                query: { type: "string", description: "Search query (e.g., 'is:issue is:open bug')" }
            },
            required: ["query"]
        }
    }
];
