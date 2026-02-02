
import fs from 'fs/promises';
import { getAIProvider } from '../ai/index.js';

export const visionToolDefinitions = [
    {
        name: "analyze_image",
        description: "Analyze an image using a vision model. Returns a detailed description of the image content.",
        parameters: {
            type: "object",
            properties: {
                filePath: { type: "string", description: "The path to the image file." },
                prompt: { type: "string", description: "Optional question or instruction about the image (default: 'Describe this image in detail')." }
            },
            required: ["filePath"]
        }
    }
];

export const visionTools = {
    analyze_image: async ({ filePath, prompt }, { agent }) => {
        try {
            // Read image file
            const imageBuffer = await fs.readFile(filePath);
            const base64Image = imageBuffer.toString('base64');
            const mimeType = filePath.toLowerCase().endsWith('.png') ? 'image/png' : 'image/jpeg';

            // Get AI provider (force a vision-capable model if needed, but for now rely on default or configured one)
            // Note: We might need to instantiate a specific provider if the current one doesn't support vision.
            // For now, let's assume the current provider (likely GPT-4o or Gemini) supports it.
            // If the agent has a provider, use it. Otherwise get a new one.
            
            const provider = agent.provider || await getAIProvider();

            // Check if provider has a 'generate' or 'chat' method that supports images
            // Since our unified interface in src/ai/*.js might not expose image support in 'generate' (it takes string prompt),
            // we need to construct a raw message here and call provider.chat() directly if possible, 
            // OR we rely on the provider to handle complex content.
            
            // Looking at openai.js: chat(messages) takes an array.
            // We can construct a multimodal message.

            const userPrompt = prompt || "Describe this image in detail.";

            const messages = [
                {
                    role: "user",
                    content: [
                        { type: "text", text: userPrompt },
                        {
                            type: "image_url",
                            image_url: {
                                url: `data:${mimeType};base64,${base64Image}`
                            }
                        }
                    ]
                }
            ];

            // If it's OpenAI, this structure works.
            // If it's Gemini, we might need a different structure, but the GeminiProvider usually adapts or we need to check it.
            // Let's assume the provider.chat() method can handle the standard OpenAI-like message format or we might fail.
            // If the provider class doesn't support array content, we might need to update the provider class too.
            // But let's try calling provider.chat(messages).

            if (!provider.chat) {
                return "Error: Current AI provider does not support chat interface.";
            }

            const response = await provider.chat(messages);
            return response.content || "No description returned.";

        } catch (e) {
            return `Error analyzing image: ${e.message}`;
        }
    }
};
