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
    *   Install dependencies.
*   **Inter-Agent Delegation**: Agents can delegate tasks to each other (e.g., General Engineer delegating to PM for planning).
*   **Persistent Memory**: Chat history is automatically saved to `~/.ai-agent-chat.json` (auto-clears after 30MB).
*   **Persistent Sessions**: Agent instances and their states are saved to `~/.ai-agent-sessions.json`.
*   **Safe Mode**: Toggleable protection against automatic file deletion or command execution.
*   **Global Access**: Run `ai-agent` from anywhere.

## Installation

1.  **Clone & Install Dependencies**:
    ```bash
    git clone <repo-url>
    cd ai-agent
    npm install
    ```

2.  **Global Link (Optional)**:
    Make the `ai-agent` command available system-wide:
    ```bash
    npm link
    ```
    Now you can just type `ai-agent` in any directory.

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

### Security & Safe Mode
⚠️ **Power User Tool**: This agent executes real shell commands.
*   **Safe Mode**: Type `/safe-mode` to enable. When enabled, the agent will **never** execute `run_command`, `write_file`, or `delete_file` without your explicit confirmation.
*   **Review**: Always check the proposed commands in the tool output before confirming (if prompted).

### Storage
*   **Chat History**: `.agent/.ai-agent-chat.json` (Per-project, rotates at 30MB).
*   **Sessions**: `.agent/sessions.json` (Per-project active agents).
*   **Config**: `~/.ai-agent-config.json` (Global API keys and preferences).

### Single Command Mode
Run a quick task without entering the shell:

```bash
ai-agent "Analyze the package.json file in the current directory"
```

### Setup Mode
Change your AI provider or model settings:
```bash
ai-agent setup
```

## Architecture
The system uses a centralized `AgentManager` to handle multiple `Agent` instances. Each agent has a specific `Persona` (system prompt + allowed tools). Agents can communicate and delegate tasks using the `delegate_task` tool.
