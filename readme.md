# AI Agent CLI

A powerful, multi-personality AI agent for your terminal. This tool allows you to collaborate with a team of specialized AI agents (Project Manager, Team Lead, Engineers, QA) to automate coding tasks, manage projects, and execute system commands directly from your shell.

## Features

*   **Multi-Agent System**: Orchestrate a team of specialized agents:
    *   **General Engineer**: The default all-rounder for coding and execution.
    *   **Project Manager (pm)**: Plans tasks, requirements, and tracks deadlines.
    *   **Team Lead (lead)**: Coordinates technical architecture and delegates tasks.
    *   **Senior/Junior Engineers**: Handle implementation tasks of varying complexity.
    *   **QA Engineer (qa)**: Runs tests and verifies integrity.
    *   **Doc Maker (docs)**: specialized in writing documentation.
    *   **Database Manager (db)**: Handles SQL and schema changes.
*   **Interactive Shell**: A persistent REPL session where you can chat, switch agents, and maintain context.
*   **System Integration**:
    *   Read/Write files.
    *   Execute shell commands.
    *   Navigate the filesystem.
    *   **GitHub CLI Support**: Uses your system's `gh` authentication to manage private repositories (issues, PRs, files).
    *   **WhatsApp Messaging**: Can proactively send WhatsApp messages on your behalf.
    *   Install dependencies.
*   **Inter-Agent Delegation**: Agents can delegate tasks to each other (e.g., General Engineer delegating to PM for planning).
*   **Persistent Memory**: Chat history is automatically saved to `~/.ai-agent-chat.json` (auto-clears after 30MB).
*   **Persistent Sessions**: Agent instances and their states are saved to `~/.ai-agent-sessions.json`.
*   **Safe Mode**: Toggleable protection against automatic file deletion or command execution.
*   **Global Access**: Run `ai-agent` from anywhere.

## Major Roadmap: MCP & Agent-to-Agent Integrations

### Context
You requested two major features: (1) allow installing MCP so the agent can access more tools, and (2) allow an agent to call another agent or integration with a command like `agent call sendEmail --payload { "email": "demo@email.com" }`, and later enable all kinds of integrations.

### Ideal Solution
*   **MCP Tool Marketplace**: A first-class plugin system where MCP servers can be installed, listed, enabled, disabled, and scoped per agent persona.
*   **Unified Invocation API**: A single command path for calling tools, integrations, or other agents with strong payload validation and permission gating.
*   **Secure Capability Model**: Each agent and MCP tool declares explicit permissions (filesystem, network, shell, integrations), with Safe Mode enforcement.
*   **Extensible Integrations**: A registry where new integrations (email, CRM, webhooks, DB, etc.) can be added with consistent schemas.

### Implementation Approach
1.  **MCP Manager**: Add an MCP registry, installer, and runtime bridge that can discover MCP servers and expose their tools as agent-callable functions.
2.  **Tool Routing Layer**: Introduce a central router that can resolve a call to either MCP tools, internal tools, integrations, or another agent.
3.  **Schema Validation**: Define JSON schemas for tool payloads and validate inputs before execution.
4.  **Agent-to-Agent Calls**: Add a command that dispatches tasks to another agent with structured payloads and a return channel.
5.  **Integration Registry**: Convert existing integrations to a registry-backed system with metadata, permissions, and schemas.

### Example Call
```bash
agent call sendEmail --payload '{ "email": "demo@email.com" }'
```

### Checklist
- [x] Capture MCP and agent-to-agent requirements in README
- [ ] Add MCP registry and installer
- [ ] Expose MCP tools via the tool router
- [ ] Implement payload schema validation
- [ ] Add agent-to-agent call command with response handling
- [ ] Migrate integrations to registry format

## 🧠 Memory & Context Optimization

### 1. Unlimited Persistent Memory
The agent now has a long-term "brain" to remember project details, rules, and preferences indefinitely.

*   **How it works**: The agent can explicitly save information to your local filesystem in `.agent/memory/`.
*   **Capabilities**:
    *   **Save**: The agent uses `memory_save` to store facts (e.g., "The API key is in .env", "User prefers dark mode").
    *   **Recall**: The agent uses `memory_search` or `memory_read` to retrieve this info when needed.
    *   **Benefit**: You don't need to repeat instructions or project context in every new session.

### 2. Context Window Optimization (Smart Offloading)
Large files or command outputs no longer crash the agent or fill up its context window.

*   **The Problem**: Reading a 500-line log file used to consume the entire AI context window, leading to "Memory Full" errors or forgetfulness.
*   **The Solution**: 
    *   If a tool's output is larger than **3,000 characters**, the agent automatically saves it to a file (`.agent/overflow/`).
    *   Only a **500-character preview** is kept in the active chat.
    *   The agent can choose to read the full file later if it specifically needs that data.
*   **Result**: You can paste huge logs or read massive codebases without breaking the agent.

## 🎧 Audio Capabilities (New!)

The agent can now speak, listen, and hold voice conversations using **Pollinations.ai**.

*   **Text-to-Speech (TTS)**: The agent can generate audio files from text using various high-quality voices (OpenAI `alloy`, `nova`, `shimmer` and ElevenLabs clones).
    *   *Usage*: `text_to_speech(text="Hello world", voice="nova")`
*   **Speech-to-Text (STT)**: Transcribe audio files (mp3, wav, etc.) to text using Whisper Large v3.
    *   *Usage*: `speech_to_text(path="recording.mp3")`
*   **Speech-to-Speech**: Create a full conversational pipeline where the agent listens to an audio file, processes it (optionally transforming the text via LLM), and speaks back a response.
    *   *Usage*: `speech_to_speech(path="input.wav", transform=true)`

**Configuration**:
These features use the Pollinations.ai API. An API key is required for some advanced features but the basic generation often works freely. To ensure reliability, add your Pollinations API key to your configuration:
1.  Get a key from [Pollinations.ai](https://enter.pollinations.ai).


## Installation

### Option 1: Install via NPM (Recommended)
Install the tool globally to use it anywhere on your system:
```bash
npm install -g @faiez-codko/ai-agent
```
Now you can run `ai-agent` from any terminal.

### Option 2: Install from Source
1.  **Clone & Install Dependencies**:
    ```bash
    git clone https://github.com/faiez-codko/ai-agent.git
    cd ai-agent
    npm install
    ```

2.  **Global Link**:
    ```bash
    npm link
    ```

3.  **Configuration**:
    The agent needs an API key. You can set this via the `setup` command or environment variables.

    **Interactive Setup:**
    ```bash
    ai-agent setup
    ```
    This will prompt for your provider (OpenAI, Gemini, Compatible), API Key, and optional Base URL. Settings are saved to `~/.ai-agent-config.json`.

    **Environment Variables (Optional):**
    Env vars take priority over the config file.
    Create a `.env` file in the project root:
    ```bash
    # For OpenAI
    OPENAI_API_KEY="sk-..."

    # For Gemini
    GEMINI_API_KEY="AIza..."
    
    # For Compatible (e.g. LocalAI, Groq, Ollama)
    OPENAI_BASE_URL="http://localhost:8080/v1"
    COMPATIBLE_API_KEY="sk-..."

    # For GitHub Tools (Optional)
    GITHUB_TOKEN="ghp_..."
    ```

## Usage

### Interactive Mode (Recommended)
Start the interactive session:
```bash
ai-agent
```

**Commands inside the shell:**
*   `/agents` - List all active agents, their IDs, and personas.
*   `/switch <id_or_name>` - Switch context to a different agent.
*   `/create <persona> [name]` - Create a new agent instance (e.g., `/create pm MyPM`).
*   `/safe-mode` - Toggle Safe Mode (forces confirmation for shell commands and file writes).
*   `/history` - View the current agent's raw memory/context.
*   `/research <dir>` - Analyze a directory structure.
*   `/clear` - Clear the current agent's short-term memory.
*   `/help` - Show available commands.
*   `/exit` - Exit the program.

**Example Workflow:**
```text
(primary) > Please create a plan for a new Todo App.
(primary) > [Delegates to PM...]
...
(primary) > /switch pm
(pm) > I have outlined the requirements. Shall I pass this to the Team Lead?
(pm) > /switch lead
(lead) > /delegate senior "Implement the core API based on PM's specs"
```

### Web Interface
Start the browser-based chat interface:
```bash
ai-agent web
```
This will start a local server at `http://localhost:8456` where you can chat with agents in a modern UI.

### Chat Integrations

Connect your AI agent to external messaging platforms.

**Commands:**
*   `ai-agent integration list` - List available integrations.
*   `ai-agent integration setup <name>` - Setup and start an integration.

**Slash Commands (Available in WhatsApp, Telegram, Email):**
*   `/help` - Show available commands.
*   `/agent` - Show details of current agent.
*   `/list` - List all active agents.
*   `/switch-agent <name_or_id>` - Switch to a different agent.
*   `/create <persona> [name]` - Create a new agent (e.g., `/create developer my-dev`).
*   `/create-persona <id> <prompt>` - Define a new persona (e.g., `/create-persona poetic "Speak in rhymes"`).
*   `/clear` - Clear chat history and memory.

**Supported Platforms:**

1.  **WhatsApp**
    *   **Setup:** Run `ai-agent integration setup whatsapp`. Scan the QR code with your WhatsApp mobile app (Linked Devices).
    *   **Auth:** Credentials saved to `~/.auth_info_baileys`.
    *   **Usage:**
        *   **Chat:** The agent listens for the **@ai** tag in any chat.
        *   **Send:** You can ask the agent to send messages for you: "Send a WhatsApp message to +1234567890 saying Hello".
        *   Works in "Note to Self", Private Chats, and Groups.

2.  **Telegram**
    *   **Setup:** Run `ai-agent integration setup telegram`. Enter your Bot Token (from [@BotFather](https://t.me/BotFather)).
    *   **Auth:** Token saved to `~/.ai-agent-config.json`.
    *   **Usage:**
        *   **Private Chat:** The bot responds to every message.
        *   **Groups:** The bot responds if:
            *   You mention it (`@YourBotName`).
            *   You include `@ai` in the message.
            *   You reply to the bot's message.

3.  **Email (Gmail/SMTP)**
    *   **Setup:** Run `ai-agent integration setup email`. Select **Gmail** or **Custom SMTP/IMAP**.
    *   **Gmail Note:** You MUST use an [App Password](https://support.google.com/accounts/answer/185833). Normal passwords won't work with 2FA enabled.
    *   **Auth:** Credentials saved to `~/.ai-agent-config.json`.
    *   **Usage:**
        *   Send an email to the configured address with `@ai` in the subject or body.
        *   The agent will reply to your email with the result.

### Security & Safe Mode
⚠️ **Power User Tool**: This agent executes real shell commands.
*   **Safe Mode**: Type `/safe-mode` to enable. When enabled, the agent will **never** execute `run_command`, `write_file`, or `delete_file` without your explicit confirmation.
*   **Review**: Always check the proposed commands in the tool output before confirming (if prompted).

### Storage
*   **Chat History**: `.agent/.ai-agent-chat.json` (Per-project, rotates at 30MB).
*   **Sessions**: `.agent/sessions.json` (Per-project active agents).
*   **Config**: `~/.ai-agent-config.json` (Global API keys and preferences).


### Setup Mode
Change your AI provider or model settings:
```bash
ai-agent setup
```

#PM2 Integration
To run the agent persistently using PM2:
```bash
pm2 start ai-agent --name ai-agent-whatsapp --interpreter none -- integration setup whatsapp
```

```bash
pm2 start ai-agent --name ai-agent-telegram --interpreter none -- integration setup telegram
```

```bash
pm2 start ai-agent --name ai-agent-email --interpreter none -- integration setup email
```

```bash
pm2 start ai-agent --name ai-agent-web --interpreter none -- web
```



## Architecture
The system uses a centralized `AgentManager` to handle multiple `Agent` instances. Each agent has a specific `Persona` (system prompt + allowed tools). Agents can communicate and delegate tasks using the `delegate_task` tool.
