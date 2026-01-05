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

  async chat(messages, tools = null) {
    try {
      const options = {
        model: this.model,
        messages,
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

      const response = await this.client.chat.completions.create(options);
      const choice = response.choices[0];
      
      return {
          content: choice.message.content,
          toolCalls: choice.message.tool_calls
      };
    } catch (error) {
      throw new Error(`OpenAI API Error: ${error.message}`);
    }
  }
}
