import { spawn } from 'child_process';

const HEADER_SEPARATOR = '\r\n\r\n';

const encodeMessage = (payload) => {
    const body = JSON.stringify(payload);
    const length = Buffer.byteLength(body, 'utf8');
    return `Content-Length: ${length}${HEADER_SEPARATOR}${body}`;
};

const extractMessages = (buffer) => {
    const messages = [];
    let current = buffer;
    while (true) {
        const headerEnd = current.indexOf(HEADER_SEPARATOR);
        if (headerEnd === -1) break;
        const header = current.slice(0, headerEnd).toString('utf8');
        const match = header.match(/Content-Length:\s*(\d+)/i);
        if (!match) break;
        const length = parseInt(match[1], 10);
        const bodyStart = headerEnd + HEADER_SEPARATOR.length;
        const totalLength = bodyStart + length;
        if (current.length < totalLength) break;
        const body = current.slice(bodyStart, totalLength).toString('utf8');
        try {
            messages.push(JSON.parse(body));
        } catch {
            messages.push({ jsonrpc: '2.0', error: { message: 'Invalid JSON from MCP server.' } });
        }
        current = current.slice(totalLength);
    }
    return { messages, remaining: current };
};

const createClient = (server, timeoutMs = 20000) => {
    const proc = spawn(server.command, server.args || [], {
        env: { ...process.env, ...(server.env || {}) },
        stdio: ['pipe', 'pipe', 'pipe']
    });

    let buffer = Buffer.alloc(0);
    const pending = new Map();

    const handleData = (chunk) => {
        buffer = Buffer.concat([buffer, chunk]);
        const { messages, remaining } = extractMessages(buffer);
        buffer = remaining;
        for (const message of messages) {
            if (message.id && pending.has(message.id)) {
                const { resolve, reject } = pending.get(message.id);
                pending.delete(message.id);
                if (message.error) {
                    reject(new Error(message.error.message || 'MCP error'));
                } else {
                    resolve(message.result);
                }
            }
        }
    };

    proc.stdout.on('data', handleData);

    const request = (method, params = {}) => {
        const id = Math.random().toString(36).slice(2);
        const payload = { jsonrpc: '2.0', id, method, params };
        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => {
                pending.delete(id);
                reject(new Error(`MCP request timed out: ${method}`));
            }, timeoutMs);
            pending.set(id, {
                resolve: (result) => {
                    clearTimeout(timer);
                    resolve(result);
                },
                reject: (error) => {
                    clearTimeout(timer);
                    reject(error);
                }
            });
            proc.stdin.write(encodeMessage(payload));
        });
    };

    const notify = (method, params = {}) => {
        const payload = { jsonrpc: '2.0', method, params };
        proc.stdin.write(encodeMessage(payload));
    };

    const close = () => {
        proc.kill();
    };

    return { request, notify, close };
};

const initializeClient = async (client) => {
    await client.request('initialize', {
        clientInfo: { name: 'ai-agent', version: '1.0.0' },
        capabilities: { tools: {} }
    });
    client.notify('initialized', {});
};

export async function listMcpTools(server) {
    const client = createClient(server);
    try {
        await initializeClient(client);
        const result = await client.request('tools/list', {});
        return result?.tools || [];
    } finally {
        client.close();
    }
}

export async function callMcpTool(server, toolName, args = {}) {
    const client = createClient(server);
    try {
        await initializeClient(client);
        const result = await client.request('tools/call', { name: toolName, arguments: args });
        return result;
    } finally {
        client.close();
    }
}
