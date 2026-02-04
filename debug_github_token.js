import { Octokit } from "octokit";
import { loadConfig } from "./src/config.js";

async function checkToken() {
    try {
        const config = await loadConfig();
        const token = config.github_token || process.env.GITHUB_TOKEN;

        if (!token) {
            console.error("No GitHub token found in config or env.");
            return;
        }

        console.log(`Token found: ${token.substring(0, 4)}...${token.substring(token.length - 4)}`);

        const octokit = new Octokit({ auth: token });

        // 1. Check Rate Limit and User (Basic Auth Check)
        console.log("Checking authentication...");
        const { data: user } = await octokit.rest.users.getAuthenticated();
        console.log(`Authenticated as: ${user.login}`);
        console.log(`Private repos plan: ${user.plan ? user.plan.private_repos : 'N/A'}`);

        // 2. Check Scopes (from headers)
        console.log("Checking scopes...");
        const { headers } = await octokit.request("HEAD /");
        const scopes = headers["x-oauth-scopes"];
        console.log(`Token Scopes: ${scopes}`);

        if (!scopes || (!scopes.includes("repo") && !scopes.includes("public_repo"))) {
            console.warn("WARNING: Token might lack 'repo' scope needed for private repositories.");
        }

        // 3. Try to list a few private repos
        console.log("Attempting to list first 5 repositories (visibility=all)...");
        const repos = await octokit.rest.repos.listForAuthenticatedUser({
            visibility: "all",
            per_page: 5
        });

        console.log("Repositories found:");
        repos.data.forEach(r => {
            console.log(`- ${r.name} (${r.private ? 'PRIVATE' : 'PUBLIC'}) - ${r.html_url}`);
        });

    } catch (error) {
        console.error("Error verifying token:");
        console.error(error.message);
        if (error.status === 401) {
            console.error("Status 401: Unauthorized. The token is invalid or expired.");
        } else if (error.status === 403) {
            console.error("Status 403: Forbidden. Resource not accessible (check scopes/SSO).");
        }
    }
}

checkToken();
