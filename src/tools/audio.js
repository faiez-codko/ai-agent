import fs from 'fs';
import path from 'path';
import os from 'os';
import fetch from 'node-fetch';
import FormData from 'form-data';
import { getApiKey } from '../config.js';

// ─── Constants & Config ──────────────────────────────────────────────────────
const AUDIO_DIR = path.join(os.tmpdir(), 'ai-agent-audio');
const BASE_URL = 'https://gen.pollinations.ai';

// Ensure audio directory exists
if (!fs.existsSync(AUDIO_DIR)) {
    fs.mkdirSync(AUDIO_DIR, { recursive: true });
}

// ─── Available voices ────────────────────────────────────────────────────────
const VOICES = {
  // Standard OpenAI voices (model: tts-1)
  openai: ['alloy', 'echo', 'fable', 'onyx', 'nova', 'shimmer',
           'ash', 'ballad', 'coral', 'sage', 'verse'],
  // ElevenLabs voices (model: eleven_v3 or tts-1)
  elevenlabs: [
    'rachel', 'domi', 'bella', 'elli', 'charlotte', 'dorothy',
    'sarah', 'emily', 'lily', 'matilda',
    'adam', 'antoni', 'arnold', 'josh', 'sam',
    'daniel', 'charlie', 'james', 'fin', 'callum',
    'liam', 'george', 'brian', 'bill',
  ],
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function authHeaders(apiKey, extra = {}) {
    // If no API key is provided, we can try to proceed without it or warn.
    // Pollinations usually requires a key now.
    const headers = { ...extra };
    if (apiKey) {
        headers['Authorization'] = `Bearer ${apiKey}`;
    }
    return headers;
}

function _mimeFromFilename(filename) {
    const ext = path.extname(filename).toLowerCase();
    const map = {
      '.mp3' : 'audio/mpeg',
      '.mp4' : 'audio/mp4',
      '.m4a' : 'audio/mp4',
      '.wav' : 'audio/wav',
      '.ogg' : 'audio/ogg',
      '.webm': 'audio/webm',
      '.flac': 'audio/flac',
      '.mpga': 'audio/mpeg',
      '.mpeg': 'audio/mpeg',
    };
    return map[ext] ?? 'audio/wav';
}

// ─── Tool Functions ──────────────────────────────────────────────────────────

/**
 * Text-to-Speech: Generates audio from text.
 * @param {string} text - The text to speak.
 * @param {string} voice - The voice to use (default: 'nova').
 * @returns {Promise<string|null>} - Path to the generated audio file.
 */
export async function generateAudio(text, voice = 'nova') {
    if (!text) return null;
    
    const apiKey = await getApiKey('compatible');
    
    if (!apiKey) {
        console.warn("Warning: No Pollinations API key found. Audio generation may fail.");
    }

    // Default to 'nova' if voice is invalid or not provided
    if (!voice) voice = 'nova';

    // Determine model based on voice (simple heuristic)
    let model = 'tts-1';
    if (VOICES.elevenlabs.includes(voice)) {
        model = 'eleven_v3'; // or tts-1, but let's try to be specific if supported
    }

    const url = `${BASE_URL}/v1/audio/speech`;
    
    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: authHeaders(apiKey, { 'Content-Type': 'application/json' }),
            body: JSON.stringify({
                model: model,
                input: text,
                voice: voice,
                response_format: 'mp3',
                speed: 1.0
            })
        });

        if (!response.ok) {
            const errText = await response.text().catch(() => '');
            throw new Error(`TTS failed [${response.status}]: ${errText}`);
        }
        
        const buffer = Buffer.from(await response.arrayBuffer());
        const filename = `audio-tts-${Date.now()}.mp3`;
        const filePath = path.join(AUDIO_DIR, filename);
        
        fs.writeFileSync(filePath, buffer);
        return filePath;
    } catch (error) {
        console.error("Audio generation failed:", error);
        return null;
    }
}

/**
 * Speech-to-Text: Transcribes audio file to text.
 * @param {string} audioPath - Path to the audio file.
 * @returns {Promise<string|null>} - The transcribed text.
 */
export async function transcribeAudio(audioPath) {
    if (!fs.existsSync(audioPath)) {
        console.error(`Audio file not found: ${audioPath}`);
        return null;
    }

    const apiKey = await getApiKey('compatible');

    const url = `${BASE_URL}/v1/audio/transcriptions`;
    const form = new FormData();
    const filename = path.basename(audioPath);
    
    form.append('file', fs.createReadStream(audioPath), {
        filename: filename,
        contentType: _mimeFromFilename(filename)
    });
    form.append('model', 'whisper-large-v3');
    form.append('response_format', 'json');

    try {
        const headers = authHeaders(apiKey);
        // Merge form headers
        Object.assign(headers, form.getHeaders());

        const response = await fetch(url, {
            method: 'POST',
            headers: headers,
            body: form
        });

        if (!response.ok) {
            const errText = await response.text().catch(() => '');
            throw new Error(`STT failed [${response.status}]: ${errText}`);
        }

        const data = await response.json();
        return (data.text || '').trim();
    } catch (error) {
        console.error("Audio transcription failed:", error);
        return null;
    }
}

/**
 * Speech-to-Speech: Transcribes, (optionally) transforms, and speaks back.
 * @param {string} audioPath - Input audio file path.
 * @param {object} options - Options for transform and output.
 * @returns {Promise<{transcript: string, response: string, audioPath: string}|null>}
 */
export async function processAudioPipeline(audioPath, options = {}) {
    const {
        transform = false,
        transformPrompt = "You are a helpful assistant. Reply concisely.",
        outputVoice = 'nova'
    } = options;

    // 1. STT
    const transcript = await transcribeAudio(audioPath);
    if (!transcript) return null;

    let textToSpeak = transcript;
    let transformedText = null;

    // 2. Transform (Chat)
    if (transform) {
        const apiKey = await getApiKey('compatible');
        
        try {
            const chatRes = await fetch(`${BASE_URL}/v1/chat/completions`, {
                method: 'POST',
                headers: authHeaders(apiKey, { 'Content-Type': 'application/json' }),
                body: JSON.stringify({
                    model: 'openai', // or specific model
                    messages: [
                        { role: 'system', content: transformPrompt },
                        { role: 'user', content: transcript }
                    ],
                    temperature: 0.7,
                    max_tokens: 1024
                })
            });
            
            if (chatRes.ok) {
                const chatData = await chatRes.json();
                transformedText = chatData.choices?.[0]?.message?.content?.trim();
                if (transformedText) {
                    textToSpeak = transformedText;
                }
            }
        } catch (e) {
            console.error("Transform step failed:", e);
        }
    }

    // 3. TTS
    const outputAudioPath = await generateAudio(textToSpeak, outputVoice);

    return {
        transcript,
        response: transformedText || transcript,
        audioPath: outputAudioPath
    };
}

/**
 * List available voices.
 */
export function listVoices() {
    return VOICES;
}

// ─── Tool Definitions ────────────────────────────────────────────────────────

export const audioToolDefinitions = [
    {
        name: "text_to_speech",
        description: "Generate audio from text using various voices (OpenAI/ElevenLabs).",
        parameters: {
            type: "object",
            properties: {
                text: { type: "string", description: "The text to speak." },
                voice: { type: "string", description: "Voice name (e.g., 'nova', 'alloy', 'rachel'). Default: 'nova'." }
            },
            required: ["text"]
        }
    },
    {
        name: "speech_to_text",
        description: "Transcribe an audio file to text.",
        parameters: {
            type: "object",
            properties: {
                path: { type: "string", description: "Path to the audio file." }
            },
            required: ["path"]
        }
    },
    {
        name: "speech_to_speech",
        description: "Process audio: Listen -> Transcribe -> (Optional Transform) -> Speak.",
        parameters: {
            type: "object",
            properties: {
                path: { type: "string", description: "Input audio file path." },
                transform: { type: "boolean", description: "Whether to transform the text via LLM before speaking back. Default: false." },
                transform_prompt: { type: "string", description: "System prompt for the transformation (if transform is true)." },
                output_voice: { type: "string", description: "Voice for the output audio. Default: 'nova'." }
            },
            required: ["path"]
        }
    },
    {
        name: "list_voices",
        description: "List all available voices for TTS.",
        parameters: {
            type: "object",
            properties: {}
        }
    }
];

export const audioTools = {
    text_to_speech: async ({ text, voice }) => {
        const filePath = await generateAudio(text, voice);
        if (!filePath) return "Failed to generate audio.";
        return `Audio generated successfully: ${filePath}`;
    },
    speech_to_text: async ({ path: audioPath }) => {
        const transcript = await transcribeAudio(audioPath);
        if (!transcript) return "Failed to transcribe audio.";
        return transcript;
    },
    speech_to_speech: async ({ path: audioPath, transform, transform_prompt, output_voice }) => {
        const result = await processAudioPipeline(audioPath, {
            transform,
            transformPrompt: transform_prompt,
            outputVoice: output_voice
        });
        if (!result) return "Failed to process audio pipeline.";
        return JSON.stringify(result, null, 2);
    },
    list_voices: async () => {
        return JSON.stringify(listVoices(), null, 2);
    }
};
