import { callMcp } from '../mcp/index.js';

const aliasMap = {
    sendemail: 'send_email',
    listemails: 'list_emails',
    sendwhatsappmessage: 'whatsapp_send_message',
    sendwhatsappmedia: 'whatsapp_send_media'
};

const normalizeToolName = (name) => {
    const trimmed = name.trim();
    const normalized = trimmed
        .replace(/([a-z])([A-Z])/g, '$1_$2')
        .replace(/[-\s]+/g, '_')
        .toLowerCase();
    return aliasMap[normalized] || normalized;
};

const preparePayload = (toolName, payload = {}) => {
    if (toolName === 'send_email') {
        const next = { ...payload };
        if (next.email && !next.to) next.to = next.email;
        if (!next.subject) next.subject = 'Hello from AI Agent';
        if (!next.body) next.body = 'Sent via AI Agent';
        return next;
    }
    return payload;
};

const validateType = (value, type) => {
    if (type === 'integer') return Number.isInteger(value);
    if (type === 'number') return typeof value === 'number' && !Number.isNaN(value);
    if (type === 'string') return typeof value === 'string';
    if (type === 'boolean') return typeof value === 'boolean';
    if (type === 'object') return typeof value === 'object' && value !== null && !Array.isArray(value);
    if (type === 'array') return Array.isArray(value);
    return true;
};

const validatePayload = (definition, payload) => {
    if (!definition?.parameters) return { ok: true };
    const required = definition.parameters.required || [];
    const props = definition.parameters.properties || {};
    const errors = [];
    for (const key of required) {
        if (payload?.[key] === undefined) {
            errors.push(`Missing required field: ${key}`);
        }
    }
    for (const [key, schema] of Object.entries(props)) {
        if (payload?.[key] !== undefined) {
            const type = Array.isArray(schema.type) ? schema.type : [schema.type];
            const ok = type.some(t => validateType(payload[key], t));
            if (!ok) {
                errors.push(`Invalid type for ${key}: expected ${type.join(' or ')}`);
            }
        }
    }
    return errors.length ? { ok: false, errors } : { ok: true };
};

const findDefinition = (toolDefinitions, toolName) => {
    return toolDefinitions.find(def => def.name === toolName);
};

export async function routeToolCall({ target, payload, tools, toolDefinitions, agent, confirmCallback }) {
    if (target.startsWith('agent:') || target.startsWith('agent/')) {
        const targetId = target.split(/[:/]/)[1];
        const instruction = payload?.instruction || payload?.task || payload?.message;
        if (!instruction) {
            throw new Error('Agent call requires payload.instruction.');
        }
        if (!tools.delegate_task) {
            throw new Error('delegate_task tool is not available.');
        }
        return await tools.delegate_task({ target_agent_id: targetId, instruction }, { agent, confirmCallback });
    }

    if (target.startsWith('mcp:')) {
        const parts = target.split(':').slice(1);
        const server = parts[0];
        const tool = parts.slice(1).join(':');
        if (!server || !tool) {
            throw new Error('MCP call format: mcp:<server>:<tool>');
        }
        return await callMcp(server, tool, payload || {});
    }

    const toolName = normalizeToolName(target);
    const definition = findDefinition(toolDefinitions, toolName);
    if (!definition) {
        throw new Error(`Tool '${toolName}' not found.`);
    }
    if (!tools[toolName]) {
        throw new Error(`Tool '${toolName}' has no implementation.`);
    }
    const preparedPayload = preparePayload(toolName, payload || {});
    const validation = validatePayload(definition, preparedPayload);
    if (!validation.ok) {
        throw new Error(validation.errors.join('\n'));
    }
    return await tools[toolName](preparedPayload, { agent, confirmCallback });
}
