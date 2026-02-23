import { listMcpTools, callMcpTool } from './client.js';
import { installMcpServer, listMcpServers, removeMcpServer, setMcpServerEnabled, getEnabledMcpServers } from './registry.js';

export { installMcpServer, listMcpServers, removeMcpServer, setMcpServerEnabled, getEnabledMcpServers };

export async function listAllMcpTools() {
    const servers = await getEnabledMcpServers();
    const results = await Promise.all(servers.map(async (server) => {
        const tools = await listMcpTools(server);
        return { server: server.name, tools };
    }));
    return results;
}

export async function callMcp(serverName, toolName, args) {
    const servers = await getEnabledMcpServers();
    const server = servers.find(s => s.name === serverName);
    if (!server) {
        throw new Error(`MCP server '${serverName}' not found or disabled.`);
    }
    return await callMcpTool(server, toolName, args);
}
