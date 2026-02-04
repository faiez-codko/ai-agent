
import { loadConfig } from '../config.js';

export class SMSGateClient {
    constructor(username, password) {
        this.username = username;
        this.password = password;
        this.baseUrl = 'https://api.sms-gate.app/3rdparty/v1';
    }

    auth() {
        return btoa(`${this.username}:${this.password}`)
    }

    async send(message, phoneNumbers, deviceId) {
        const res = await fetch(`${this.baseUrl}/messages`, {
            method: 'POST',
            headers: {
                'Authorization': 'Basic ' + this.auth(),
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                textMessage: { text: message },
                phoneNumbers,
                deviceId
            })
        });
        return await res.json();
    }

    async getDevices() {
        const res = await fetch(`${this.baseUrl}/devices`, {
            method: 'GET',
            headers: {
                'Authorization': 'Basic ' + this.auth(),
                'Content-Type': 'application/json'
            }
        });
        return await res.json();
    }

    async getMessageStatus(messageId) {
        const res = await fetch(`${this.baseUrl}/messages/${messageId}`, {
            method: 'GET',
            headers: {
                'Authorization': 'Basic ' + this.auth(),
                'Content-Type': 'application/json'
            }
        });
        return await res.json();
    }

    async getLogs() {
        const res = await fetch(`${this.baseUrl}/logs`, {
            method: 'GET',
            headers: {
                'Authorization': 'Basic ' + this.auth(),
                'Content-Type': 'application/json'
            }
        });
        return await res.json();
    }
}

// Helper to get client from agent
async function getClient(agent) {
    if (agent.smsClient) {
        return agent.smsClient;
    }
    
    // Try to auto-configure from config
    const config = await loadConfig();
    if (config.sms_username && config.sms_password) {
        agent.smsClient = new SMSGateClient(config.sms_username, config.sms_password);
        return agent.smsClient;
    }

    throw new Error("SMS Gate client not configured. Use sms_configure first or set credentials in setup.");
}

export const smsToolDefinitions = [
    {
        name: "sms_configure",
        description: "Configure the SMS Gate client with username and password.",
        parameters: {
            type: "object",
            properties: {
                username: { type: "string", description: "SMS Gate username" },
                password: { type: "string", description: "SMS Gate password" }
            },
            required: ["username", "password"]
        }
    },
    {
        name: "sms_send",
        description: "Send an SMS message to one or more phone numbers.",
        parameters: {
            type: "object",
            properties: {
                message: { type: "string", description: "The text message to send." },
                phoneNumbers: { 
                    type: "array", 
                    items: { type: "string" },
                    description: "List of phone numbers (e.g. ['+1234567890'])" 
                },
                deviceId: { type: "string", description: "Optional device ID to send from." }
            },
            required: ["message", "phoneNumbers"]
        }
    },
    {
        name: "sms_devices",
        description: "Get list of available devices.",
        parameters: {
            type: "object",
            properties: {},
            required: []
        }
    },
    {
        name: "sms_status",
        description: "Get the status of a specific message.",
        parameters: {
            type: "object",
            properties: {
                messageId: { type: "string", description: "The ID of the message to check." }
            },
            required: ["messageId"]
        }
    },
    {
        name: "sms_logs",
        description: "Get SMS logs.",
        parameters: {
            type: "object",
            properties: {},
            required: []
        }
    }
];

export const smsTools = {
    sms_configure: async ({ username, password }, { agent }) => {
        agent.smsClient = new SMSGateClient(username, password);
        return "SMS Gate client configured successfully.";
    },
    sms_send: async ({ message, phoneNumbers, deviceId }, { agent }) => {
        const client = await getClient(agent);
        // Use default device ID from config if not provided
        if (!deviceId) {
            const config = await loadConfig();
            if (config.sms_device_id) deviceId = config.sms_device_id;
        }
        return await client.send(message, phoneNumbers, deviceId);
    },
    sms_devices: async ({}, { agent }) => {
        const client = await getClient(agent);
        return await client.getDevices();
    },
    sms_status: async ({ messageId }, { agent }) => {
        const client = await getClient(agent);
        return await client.getMessageStatus(messageId);
    },
    sms_logs: async ({}, { agent }) => {
        const client = await getClient(agent);
        return await client.getLogs();
    }
};
