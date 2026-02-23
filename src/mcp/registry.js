import { loadConfig, saveConfig } from '../config.js';

const ensureMcpConfig = (config) => {
    const next = config || {};
    if (!next.mcp) next.mcp = {};
    if (!next.mcp.servers) next.mcp.servers = {};
    return next;
};

export async function listMcpServers() {
    const config = ensureMcpConfig(await loadConfig());
    return config.mcp.servers;
}

export async function installMcpServer({ name, command, args = [], env = {}, enabled = true }) {
    if (!name || !command) {
        throw new Error('MCP server name and command are required.');
    }
    const config = ensureMcpConfig(await loadConfig());
    config.mcp.servers[name] = {
        name,
        command,
        args,
        env,
        enabled
    };
    await saveConfig(config);
    return config.mcp.servers[name];
}

export async function removeMcpServer(name) {
    const config = ensureMcpConfig(await loadConfig());
    if (!config.mcp.servers[name]) {
        throw new Error(`MCP server '${name}' not found.`);
    }
    delete config.mcp.servers[name];
    await saveConfig(config);
}

export async function setMcpServerEnabled(name, enabled) {
    const config = ensureMcpConfig(await loadConfig());
    if (!config.mcp.servers[name]) {
        throw new Error(`MCP server '${name}' not found.`);
    }
    config.mcp.servers[name].enabled = enabled;
    await saveConfig(config);
    return config.mcp.servers[name];
}

export async function getEnabledMcpServers() {
    const servers = await listMcpServers();
    return Object.values(servers).filter(server => server.enabled !== false);
}
