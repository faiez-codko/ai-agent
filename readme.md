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
    The agent needs an API key. You can set this in a `.env` file in the project root or export it in your shell.

    **Supported Providers:**
    *   **OpenAI** (Default)
    *   **Gemini**
    *   **OpenAI Compatible** (LocalAI, Groq, etc.)

    ```bash
    # For OpenAI
    export OPENAI_API_KEY="sk-..."

    # For Gemini
    export GEMINI_API_KEY="AIza..."
    
    # For Compatible (e.g. LocalAI)
    export OPENAI_BASE_URL="http://localhost:8080/v1"
    export COMPATIBLE_API_KEY="sk-..."
    ```

    *Run `ai-agent setup` to configure the preferred provider interactively.*

## Usage

### Interactive Mode (Recommended)
Start the interactive session:
```bash
ai-agent
```

**Commands inside the shell:**
*   `/agents` - List all active agents and their status.
*   `/switch <agent_name>` - Switch context to a different agent (e.g., `/switch pm`).
*   `/create <persona> [name]` - Create a new agent instance from a persona.
*   `/clear` - Clear the current screen.
*   `/help` - Show available commands.
*   `/exit` - Exit the program.

**Example Workflow:**
```text
(General) > Please create a plan for a new Todo App.
(General) > [Delegates to PM...]
...
(General) > /switch pm
(Project Manager) > I have outlined the requirements. Shall I pass this to the Team Lead?
(Project Manager) > /switch lead
(Team Lead) > /delegate senior "Implement the core API based on PM's specs"
```

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

## Storage
*   **Config**: Stored in `~/.ai-agent-config.json`
*   **Chat History**: Stored in `~/.ai-agent-chat.json`. The file is automatically managed and will rotate/clear if it exceeds 30MB to save disk space.

## Architecture
The system uses a centralized `AgentManager` to handle multiple `Agent` instances. Each agent has a specific `Persona` (system prompt + allowed tools). Agents can communicate and delegate tasks using the `delegate_task` tool.
