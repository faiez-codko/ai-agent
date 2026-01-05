import { getAIProvider } from './ai/index.js';
import { readFile, writeFile, listFiles } from './tools/fs.js';
import { runCommand } from './tools/shell.js';
import { tools as toolImplementations, toolDefinitions } from './tools/index.js';
import { loadPersona } from './personas/index.js';
import chalk from 'chalk';
import path from 'path';

export class Agent {
  constructor(config = {}) {
    this.provider = null;
    this.memory = []; // Store chat history
    
    // Config properties
    this.cwd = process.cwd();
    this.personaId = config.personaId || 'default';
    this.persona = null; // Loaded in init()
    this.name = config.name || 'AI';
    this.manager = config.manager || null;
    
    // Tools will be filtered in init()
    this.toolsDefinition = []; 
    this.tools = {};
  }

  async init() {
    this.provider = await getAIProvider();
    
    // Load Persona
    this.persona = await loadPersona(this.personaId);
    this.name = this.persona.name;
    
    // Filter tools based on persona
    const allowed = new Set(this.persona.allowedTools || []);
    this.toolsDefinition = toolDefinitions.filter(t => allowed.has(t.name));
    
    // Map implementations
    this.tools = {};
    for (const name of allowed) {
        if (toolImplementations[name]) {
            this.tools[name] = toolImplementations[name];
        }
    }

    const systemPrompt = `You are ${this.name}.
${this.persona.systemPrompt}

You have access to the following tools: ${this.toolsDefinition.map(t => t.name).join(', ')}.

IMPORTANT:
1. ALWAYS use the provided tools to perform actions. 
2. Do NOT describe what you are going to do with a tool in JSON format in your text response. USE THE NATIVE TOOL CALLING MECHANISM.
3. If native tool calling fails, output a JSON block in this exact format:
\`\`\`json
{ "tool": "tool_name", "args": { "param": "value" } }
\`\`\`
4. Do not hallucinate file contents.
5. When navigating directories, use change_directory (cd) and read_dir.
`;

    this.memory.push({
      role: 'system',
      content: systemPrompt
    });
  }

  async chat(userMessage, confirmCallback = null) {
    this.memory.push({ role: 'user', content: userMessage });
    
    let loopCount = 0;
    const MAX_LOOPS = 100;
    let finalResponse = null;

    while (loopCount < MAX_LOOPS) {
        // Call provider
        const response = await this.provider.chat(this.memory, this.toolsDefinition);
        
        // Fallback: Check for JSON tool calls in content if native toolCalls are empty
        if ((!response.toolCalls || response.toolCalls.length === 0) && response.content) {
            // Regex to find JSON blocks (supports json, python, or no language tag)
            // Modified to be more lenient: optional code blocks
            const jsonMatch = response.content.match(/```(?:json|python|js)?\s*(\{[\s\S]*?\})\s*```/) || 
                              response.content.match(/^\s*(\{[\s\S]*?\})\s*$/); // Match raw JSON if it's the only thing (or main thing)
            
            if (jsonMatch) {
                try {
                    const parsed = JSON.parse(jsonMatch[1]);
                    // Support various formats the model might hallucinate
                    const toolName = parsed.tool || parsed.cmd_type || parsed.function || parsed.name;
                    
                    if (toolName && this.tools[toolName]) {
                         // It's a valid tool call!
                         // If args are nested (like in my instruction), use them. 
                         // If flat (like the user's error log), use the whole object.
                         const args = parsed.args || parsed.arguments || parsed.parameters || parsed; 
                         
                         const fakeToolCall = {
                             id: 'fallback-' + Date.now(),
                             function: {
                                 name: toolName,
                                 arguments: JSON.stringify(args)
                             }
                         };
                         
                         // Initialize toolCalls array
                         response.toolCalls = [fakeToolCall];
                         
                         // Optional: Clean up the content so we don't show the raw JSON to user twice
                         // But for now, keeping it might be useful for debugging. 
                         // Let's append a note.
                         console.log(chalk.yellow(`(Detected JSON tool call in text: ${toolName})`));
                    }
                } catch (e) {
                    // Ignore parse errors, it might just be code snippet
                }
            }
        }

        // If content is present, add it to memory (some models output thought + tool call)
        if (response.content) {
            this.memory.push({ role: 'assistant', content: response.content });
            finalResponse = response.content;
        }

        // If no tool calls, we are done
        if (!response.toolCalls || response.toolCalls.length === 0) {
            return finalResponse || response.content;
        }

        // If we have tool calls, execute them
        // Note: We need to push the tool call request to memory for OpenAI
        if (!response.content) {
             this.memory.push({ 
                 role: 'assistant', 
                 content: null, 
                 tool_calls: response.toolCalls 
             });
        }

        for (const call of response.toolCalls) {
            const toolName = call.function.name;
            const args = JSON.parse(call.function.arguments);
            
            console.log(chalk.gray(`\n> Calling tool: ${toolName} with args: ${JSON.stringify(args)}`));

            let result;
            try {
                if (this.tools[toolName]) {
                    // Pass confirmCallback and agent instance (this) to tools
                    result = await this.tools[toolName](args, { confirmCallback, agent: this });
                } else {
                    result = `Error: Tool ${toolName} not found.`;
                }
            } catch (error) {
                result = `Error executing tool: ${error.message}`;
            }

            console.log(chalk.gray(`> Tool Result: ${result.slice(0, 100)}...`));

            // Push tool result to memory
            this.memory.push({
                role: 'tool',
                tool_call_id: call.id,
                name: toolName,
                content: result
            });
        }
        
        loopCount++;
    }

    writeFile('./memory.json', JSON.stringify(this.memory, null, 2));

    return "Error: Maximum tool loop limit reached.";
  }

  async researchDirectory(dirPath) {
    const files = await listFiles(`${dirPath}/**/*`);
    let summary = `Directory listing for ${dirPath}:\n`;
    
    // Limit to prevent token overflow. 
    // Strategy: List all files, but only read content of first 10 text files or specific types.
    // For now, let's just list them and read the first few relevant files.
    
    summary += files.join('\n');
    summary += '\n\nSelected File Contents:\n';

    let fileCount = 0;
    for (const file of files) {
        if (fileCount >= 5) break; // Limit to 5 files for now
        // Skip lock files, images, etc.
        if (file.endsWith('.json') || file.endsWith('.js') || file.endsWith('.md') || file.endsWith('.html') || file.endsWith('.css')) {
             try {
                 const content = await readFile(file);
                 summary += `\n--- File: ${file} ---\n${content}\n`;
                 fileCount++;
             } catch (e) {
                 // ignore read errors
             }
        }
    }

    const prompt = `
I have investigated the directory "${dirPath}".
Here is the summary of the files and contents:
\`\`\`
${summary}
\`\`\`

Please analyze this project structure and content. Explain what it is and remember this context for future questions.
`;
    
    // We treat this as a user message (or system observation)
    return await this.chat(prompt);
  }

  async analyzeFile(filePath, question) {
    const content = await readFile(filePath);
    const prompt = `
File: ${filePath}
Content:
\`\`\`
${content}
\`\`\`

User Question: ${question || 'Summarize this file and explain what it does.'}
`;
    return await this.provider.generate(prompt);
  }

  async updateFile(filePath, instruction) {
    const content = await readFile(filePath);
    const prompt = `
You are an expert software engineer.
File: ${filePath}
Content:
\`\`\`
${content}
\`\`\`

Instruction: ${instruction}

Output ONLY the updated file content. Do not include markdown code blocks (like \`\`\`javascript) or explanations. Just the raw code.
`;
    const newContent = await this.provider.generate(prompt);
    const cleanedContent = newContent.replace(/^```[a-z]*\n/i, '').replace(/\n```$/, '');
    
    return cleanedContent;
  }

  async fixFile(filePath, errorContext = '') {
    const content = await readFile(filePath);
    const prompt = `
You are an expert software engineer.
File: ${filePath}
Content:
\`\`\`
${content}
\`\`\`

${errorContext ? `Error Context:\n${errorContext}` : 'Identify potential bugs or issues in this code and fix them.'}

Output ONLY the fixed file content. Do not include markdown code blocks or explanations.
`;
    const newContent = await this.provider.generate(prompt);
    const cleanedContent = newContent.replace(/^```[a-z]*\n/i, '').replace(/\n```$/, '');
    return cleanedContent;
  }

  async generateCommand(instruction) {
    const prompt = `
You are a CLI expert.
User Instruction: ${instruction}

Return a single line shell command (or a chain of commands with &&) to accomplish this task on Windows.
Do NOT output markdown blocks. Output ONLY the command.
`;
    const command = await this.provider.generate(prompt);
    return command.trim();
  }
}
