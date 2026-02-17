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
    // Priority: 1. Environment Variables, 2. Config File
    
    // 1. Check Env Vars
    if (provider === 'openai' && process.env.OPENAI_API_KEY) return process.env.OPENAI_API_KEY;
    if (provider === 'gemini' && process.env.GEMINI_API_KEY) return process.env.GEMINI_API_KEY;
    if (provider === 'compatible' && process.env.COMPATIBLE_API_KEY) return process.env.COMPATIBLE_API_KEY;
    if (provider === 'pollination' && process.env.POLLINATIONS_KEY) return process.env.POLLINATIONS_KEY;

    // 2. Check Config File
    const config = await loadConfig();
    if (provider === 'openai') return config.openai_api_key;
    if (provider === 'gemini') return config.gemini_api_key;
    if (provider === 'compatible') return config.compatible_api_key;
    if (provider === 'pollination') return config.pollination_api_key;

    return null;
}

export async function getGitHubToken() {
    // 1. Check Env Vars
    if (process.env.GITHUB_TOKEN) return process.env.GITHUB_TOKEN;

    // 2. Check Config File
    const config = await loadConfig();
    return config.github_token;
}
