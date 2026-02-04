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
    
    // Pollinations API: https://text.pollinations.ai/{prompt}?model=openai-audio&voice={voice}
    const url = `https://text.pollinations.ai/${encodeURIComponent(text)}?model=openai-audio&voice=${voice}`;
    
    try {
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`Failed to generate audio: ${response.statusText}`);
        }
        
        const buffer = await response.buffer();
        const filename = `audio-${Date.now()}.mp3`;
        const filePath = path.join(AUDIO_DIR, filename);
        
        fs.writeFileSync(filePath, buffer);
        return filePath;
    } catch (error) {
        console.error("Audio generation failed:", error);
        return null;
    }
}
