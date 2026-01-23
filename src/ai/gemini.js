import { GoogleGenerativeAI } from '@google/generative-ai';

export class GeminiProvider {
  constructor(apiKey, model = 'gemini-1.5-flash') {
    this.genAI = new GoogleGenerativeAI(apiKey);
    this.model = this.genAI.getGenerativeModel({ model });
  }

  async generate(prompt, systemInstruction) {
    try {
      let finalPrompt = prompt;
      if (systemInstruction) {
          finalPrompt = `${systemInstruction}\n\n${prompt}`;
      }

      const result = await this.model.generateContent(finalPrompt);
      const response = await result.response;
      return response.text();
    } catch (error) {
      throw new Error(`Gemini API Error: ${error.message}`);
    }
  }

  async chat(messages, tools = null, onUpdate = null) {
    try {
      // Convert standard messages format to Gemini format
      // Standard: [{ role: 'user'|'assistant'|'system', content: '...' }]
      // Gemini: history: [{ role: 'user'|'model', parts: [{ text: '...' }] }]
      
      const history = messages.slice(0, -1).map(msg => {
          const parts = [];
          if (msg.content) parts.push({ text: msg.content });
          
          // Map tool calls if they exist in history (simplified for now)
          // Gemini expects functionCall in parts if role is model
          // And functionResponse in parts if role is function/tool
          // This mapping is complex for cross-provider compatibility.
          // For now, let's assume text-only history for simplicity or basic text mapping.
          
          return {
            role: msg.role === 'assistant' ? 'model' : 'user',
            parts: parts
          };
      });

      const options = { history };
      
      if (tools && tools.length > 0) {
          options.tools = [{
              function_declarations: tools.map(t => ({
                  name: t.name,
                  description: t.description,
                  parameters: t.parameters
              }))
          }];
      }

      const lastMessage = messages[messages.length - 1];
      const chat = this.model.startChat(options);

      if (onUpdate) {
        const result = await chat.sendMessageStream(lastMessage.content);
        let fullContent = '';
        let toolCalls = null;

        for await (const chunk of result.stream) {
            const chunkText = chunk.text();
            if (chunkText) {
                fullContent += chunkText;
                onUpdate({ type: 'token', content: chunkText });
            }
            
            // Check for tool calls in chunk (accumulate)
            // Gemini stream usually gives tool calls at end or in specific chunks
            const calls = chunk.functionCalls();
            if (calls && calls.length > 0) {
                 if (!toolCalls) toolCalls = [];
                 toolCalls.push(...calls.map(call => ({
                    id: 'gemini-' + Math.random().toString(36).substr(2, 9),
                    type: 'function',
                    function: {
                        name: call.name,
                        arguments: JSON.stringify(call.args)
                    }
                })));
            }
        }
        
        return {
            content: fullContent || null,
            toolCalls: toolCalls
        };

      } else {
        const result = await chat.sendMessage(lastMessage.content);
        const response = await result.response;
        
        // Check for function calls
        const calls = response.functionCalls();
        let toolCalls = null;
        
        if (calls && calls.length > 0) {
            toolCalls = calls.map(call => ({
                id: 'gemini-' + Math.random().toString(36).substr(2, 9),
                type: 'function',
                function: {
                    name: call.name,
                    arguments: JSON.stringify(call.args)
                }
            }));
        }

        return {
            content: response.text(), // This might throw if blocked or only function call
            toolCalls: toolCalls
        };
      }
    } catch (error) {
      // Gemini throws if we try to get text() from a function call only response sometimes
      // We need to handle that gracefully
      if (error.message.includes('Candidate was blocked') || error.message.includes('No content')) {
          // It might be a pure tool call response, let's try to extract it from candidate if possible
          // But SDK usually provides functionCalls() method on response.
          // Let's assume the previous logic worked or we return just toolCalls.
           return { content: null, toolCalls: [] }; // Fallback
      }
      throw new Error(`Gemini API Error: ${error.message}`);
    }
  }
}
