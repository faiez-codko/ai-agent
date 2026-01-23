import OpenAI from 'openai';

export class OpenAIProvider {
  constructor(apiKey, baseURL = null, model = 'gpt-4o') {
    this.client = new OpenAI({
      apiKey,
      baseURL: baseURL || undefined,
    });
    this.model = model;
  }

  async generate(prompt, systemInstruction) {
    try {
      const messages = [];
      if (systemInstruction) {
        messages.push({ role: 'system', content: systemInstruction });
      }
      messages.push({ role: 'user', content: prompt });

      return this.chat(messages);
    } catch (error) {
      throw new Error(`OpenAI API Error: ${error.message}`);
    }
  }

  async chat(messages, tools = null, onUpdate = null) {
    try {
      const options = {
        model: this.model,
        messages,
        stream: !!onUpdate,
      };

      if (tools && tools.length > 0) {
          options.tools = tools.map(t => ({
              type: 'function',
              function: {
                  name: t.name,
                  description: t.description,
                  parameters: t.parameters
              }
          }));
      }

      if (onUpdate) {
        const stream = await this.client.chat.completions.create(options);
        let fullContent = '';
        let toolCallsMap = new Map();

        for await (const chunk of stream) {
            const delta = chunk.choices[0]?.delta;
            if (!delta) continue;

            // Handle content
            if (delta.content) {
                fullContent += delta.content;
                onUpdate({ type: 'token', content: delta.content });
            }

            // Handle tool calls (accumulate chunks)
            if (delta.tool_calls) {
                for (const tc of delta.tool_calls) {
                    if (!toolCallsMap.has(tc.index)) {
                        toolCallsMap.set(tc.index, { 
                            id: tc.id, 
                            function: { name: '', arguments: '' },
                            type: 'function'
                        });
                    }
                    const stored = toolCallsMap.get(tc.index);
                    if (tc.id) stored.id = tc.id;
                    if (tc.function?.name) stored.function.name += tc.function.name;
                    if (tc.function?.arguments) stored.function.arguments += tc.function.arguments;
                }
            }
        }

        const toolCalls = Array.from(toolCallsMap.values()).map(tc => ({
            id: tc.id,
            type: tc.type,
            function: {
                name: tc.function.name,
                arguments: tc.function.arguments // Keep as string, parsed later
            }
        }));

        return {
            content: fullContent || null,
            toolCalls: toolCalls.length > 0 ? toolCalls : null
        };

      } else {
        const response = await this.client.chat.completions.create(options);
        const choice = response.choices[0];
        
        return {
            content: choice.message.content,
            toolCalls: choice.message.tool_calls
        };
      }
    } catch (error) {
      throw new Error(`OpenAI API Error: ${error.message}`);
    }
  }
}
