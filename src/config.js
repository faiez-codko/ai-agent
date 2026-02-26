import fs from 'fs/promises';
import path from 'path';
import os from 'os';

const CONFIG_FILE = path.join(os.homedir(), '.ai-agent-config.json');
const DEFAULT_CONFIG = {
  provider: 'openai',
  model: 'gpt-4o',
  browser: {
    searchEngine: 'duckduckgo',
    headless: false,
    browserless: {
      enabled: false,
      endpoint: 'wss://production-sfo.browserless.io',
      token: null
    },
    proxy: null,
    captcha: {
      mode: 'manual',
      provider: null,
      apiKey: null,
      autoDetect: true
    }
  }
};

export async function loadConfig() {
  try {
    const data = await fs.readFile(CONFIG_FILE, 'utf-8');
    const parsed = JSON.parse(data);
    return {
      ...DEFAULT_CONFIG,
      ...parsed,
      browser: {
        ...DEFAULT_CONFIG.browser,
        ...(parsed.browser || {}),
        browserless: {
          ...DEFAULT_CONFIG.browser.browserless,
          ...(parsed.browser?.browserless || {})
        },
        captcha: {
          ...DEFAULT_CONFIG.browser.captcha,
          ...(parsed.browser?.captcha || {})
        }
      }
    };
  } catch (error) {
    return { ...DEFAULT_CONFIG };
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
