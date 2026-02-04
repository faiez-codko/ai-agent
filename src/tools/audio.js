import fs from 'fs';
import path from 'path';
import os from 'os';
import fetch from 'node-fetch';

const AUDIO_DIR = path.join(os.tmpdir(), 'ai-agent-audio');

// Ensure audio directory exists
if (!fs.existsSync(AUDIO_DIR)) {
    fs.mkdirSync(AUDIO_DIR, { recursive: true });
}

export async function generateAudio(text, voice = 'alloy') {
    if (!text) return null;

    // Clean text (remove emojis, code blocks if necessary, but TTS might handle them)
    // For now, let's just pass it through.
    
    // New Unified API Endpoint (POST request required for audio)
    // https://gen.pollinations.ai/v1/chat/completions
    const url = 'https://gen.pollinations.ai/v1/chat/completions';
    
    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                model: 'openai-audio',
                messages: [{ role: 'user', content: text }],
                modalities: ['text', 'audio'],
                audio: {
                    voice: voice,
                    format: 'mp3'
                }
            })
        });

        if (!response.ok) {
            throw new Error(`Failed to generate audio: ${response.status} ${response.statusText}`);
        }
        
        const data = await response.json();
        
        // The API returns base64 encoded audio in choices[0].message.audio.data
        if (!data.choices || !data.choices[0] || !data.choices[0].message || !data.choices[0].message.audio || !data.choices[0].message.audio.data) {
             throw new Error("Invalid API response format: Missing audio data");
        }

        const audioBase64 = data.choices[0].message.audio.data;
        const buffer = Buffer.from(audioBase64, 'base64');
        
        const filename = `audio-${Date.now()}.mp3`;
        const filePath = path.join(AUDIO_DIR, filename);
        
        fs.writeFileSync(filePath, buffer);
        return filePath;
    } catch (error) {
        console.error("Audio generation failed:", error);
        return null;
    }
}
