import { OpenAIProvider } from './openai.js';
import { GeminiProvider } from './gemini.js';
import { loadConfig, getApiKey } from '../config.js';

export async function getAIProvider(modelOverride = null) {
  const config = await loadConfig();
  const providerType = config.provider;
  
  const apiKey = await getApiKey(providerType);
  if (!apiKey) {
    throw new Error(`API Key for ${providerType} not found in environment variables.`);
  }

  if (providerType === 'openai') {
    return new OpenAIProvider(apiKey, null, modelOverride || config.model || 'gpt-4o');
  } else if (providerType === 'gemini') {
    return new GeminiProvider(apiKey, modelOverride || config.model || 'gemini-1.5-flash');
  } else if (providerType === 'compatible') {
     // OpenAI compatible (e.g. LocalAI, Groq, etc.)
     // Requires BASE_URL env var or config
     const baseURL = process.env.OPENAI_BASE_URL || config.compatible_base_url;
     return new OpenAIProvider(apiKey, baseURL, modelOverride || config.model || 'gpt-3.5-turbo');
  } else {
    throw new Error(`Unknown provider: ${providerType}`);
  }
}
