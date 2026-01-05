# ai-agent


## Installation

1.Install Dependencies (Already done):

```bash
npm install -g ai-agent
```

2. Set Environment Variables :
You need to set your API keys. Create a .env file or set them in your shell:

```bash
# For OpenAI
export OPENAI_API_KEY="sk-..."
# For Gemini
export GEMINI_API_KEY="AIza..."
# For Compatible (e.g. LocalAI)
export OPENAI_BASE_URL="http://localhost:8080/v1"

```

3.Run the Agent :
You can run it using node index.js or link it (e.g., npm link ).

```bash
node index.js setup
```
Selects the AI provider and model.

Read a file:

```bash
node index.js read ./demo.js "What does this file do?"
```