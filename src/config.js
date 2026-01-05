import fs from 'fs/promises';
import path from 'path';
import os from 'os';

const CONFIG_FILE = path.join(os.homedir(), '.ai-agent-config.json');

export async function loadConfig() {
  try {
    const data = await fs.readFile(CONFIG_FILE, 'utf-8');
    return JSON.parse(data);
  } catch (error) {
    return {
      provider: 'openai', // default
      model: 'gpt-4o',
    };
  }
}

export async function saveConfig(config) {
  await fs.writeFile(CONFIG_FILE, JSON.stringify(config, null, 2));
}

export async function getApiKey(provider) {
    // In a real app, we might check a secure store or the config file.
    // For now, we rely on environment variables.
    if (provider === 'openai') {
        return process.env.OPENAI_API_KEY;
    } else if (provider === 'gemini') {
        return process.env.GEMINI_API_KEY;
    } else if (provider === 'compatible') {
        return process.env.COMPATIBLE_API_KEY;
    }
    return null;
}
