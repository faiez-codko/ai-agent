# Agent Memory & Context Architecture — Upgrade Guide

## What Changed (v2.0)

### Problem
The agent was experiencing:
1. **Hallucination and task drift** — after many tool calls, the model lost track of the original goal
2. **Context window overflow** — tool outputs (file contents, command results) consumed 60%+ of context
3. **No persistent knowledge** — every session started fresh, with no memory of past learnings

### Root Causes
| Issue | Root Cause | Fix |
|-------|-----------|-----|
| Hallucination | Original task buried under 30+ tool outputs | **Task Anchoring** — re-inject goal every 5 tool calls |
| Context overflow | Tool outputs stayed at full size forever | **Stale Output Compression** — outputs older than 15 messages auto-compressed |
| No persistence | Relied on AI remembering to save to files | **Workspace Knowledge** — SOUL.md, TOOLS.md, MEMORY.md auto-loaded into every session |
| Too many tools | 50+ tool calls before any summarization | **Earlier summarization** — threshold lowered from 80k→40k tokens |
| Temperature too high | `temperature: 0.7` caused creative wandering | **Lowered to 0.5** for more focused, deterministic responses |

---

## Architecture Overview

### Memory Layers (New)

```
┌─────────────────────────────────────────────────────────┐
│                    SYSTEM PROMPT                         │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐              │
│  │ SOUL.md  │  │ TOOLS.md │  │AGENTS.md │  (Identity)   │
│  └──────────┘  └──────────┘  └──────────┘              │
│  ┌──────────────────────┐  ┌─────────────────┐          │
│  │     MEMORY.md        │  │ Daily Memory    │  (Facts)  │
│  │  (Persistent Facts)  │  │ (YYYY-MM-DD.md) │          │
│  └──────────────────────┘  └─────────────────┘          │
│  ┌──────────────────────────────────────────┐           │
│  │         Persona System Prompt            │  (Role)    │
│  └──────────────────────────────────────────┘           │
└─────────────────────────────────────────────────────────┘
                          ▼
┌─────────────────────────────────────────────────────────┐
│                 CONVERSATION MEMORY                      │
│                                                          │
│  [User Message] ← Task Anchor tracks this               │
│      ▼                                                   │
│  [Tool Call #1] → [Tool Result (full)]                   │
│  [Tool Call #2] → [Tool Result (full)]                   │
│  ...                                                     │
│  [Tool Call #5] → [Tool Result (full)]                   │
│  [TASK ANCHOR: "Your goal is: <original request>"]       │  ← Injected
│  [Tool Call #6] → [Tool Result (full)]                   │
│  ...                                                     │
│  [Older tool results] → [COMPRESSED to 150 chars]        │  ← Auto-compressed
│                                                          │
│  IF tokens > 40k → SUMMARIZE old messages               │
│  IF tokens > 120k → FALLBACK: keep only last 10-20 msgs │
└─────────────────────────────────────────────────────────┘
                          ▼
┌─────────────────────────────────────────────────────────┐
│               PERSISTENT STORAGE                         │
│                                                          │
│  SQLite DB (.agent/.ai-agent-chat.sqlite)               │
│    └── agents / chat_sessions / chat (messages)          │
│                                                          │
│  Workspace Files (~/.agent/workspace/)                   │
│    ├── SOUL.md        (identity + behavioral rules)      │
│    ├── TOOLS.md       (tool usage patterns)              │
│    ├── AGENTS.md      (delegation patterns)              │
│    ├── MEMORY.md      (persistent facts)                 │
│    ├── memory/                                           │
│    │   └── YYYY-MM-DD.md (daily session logs)            │
│    └── .learnings/                                       │
│        ├── LEARNINGS.md  (insights)                      │
│        ├── ERRORS.md     (error patterns)                │
│        └── FEATURE_REQUESTS.md                           │
│                                                          │
│  Overflow Files (.agent/overflow/)                       │
│    └── overflow_<timestamp>_<tool>.txt                   │
│                                                          │
│  Archive (.agent/archive/)                               │
│    └── <agent>_<timestamp>.json                          │
└─────────────────────────────────────────────────────────┘
```

---

## New Files Created

| File | Purpose |
|------|---------|
| `src/memory/workspace.js` | Core workspace memory system — loads, saves, prunes workspace files |
| `src/tools/workspace_memory.js` | Tool definitions for agent to programmatically log learnings/errors/facts |

## Modified Files

| File | Changes |
|------|---------|
| `src/agent.js` | Added task anchoring, workspace context loading, stale output compression, earlier summarization |
| `src/memory/summary.js` | Lowered summarization threshold (80k→40k), daily memory logging on summarize |
| `src/tools/index.js` | Registered workspace memory tools |
| `src/personas/default.json` | Added workspace tools, updated system prompt, lowered temperature to 0.5 |

---

## Key Mechanisms

### 1. Task Anchoring
Every 5 tool calls, a `[TASK ANCHOR]` system message is injected into the conversation:
```
[TASK ANCHOR — Reminder] Your CURRENT GOAL is: "Build a REST API for users"
You have made 10 tool calls. Stay focused. What is the next step?
```
This prevents the agent from drifting after many tool calls.

### 2. Stale Output Compression (Tool-Aware)
Tool outputs that are more than 15 messages old are automatically compressed — **except for context-critical tools**:
```
[Stale output from read_file — compressed] const express = require('express'); const app = express()... (2847 chars, use read_file if needed)
```

**Context-Critical Tools (NEVER compressed):**
- `browser_visit`, `browser_eval`, `browser_fetch`, `browser_screenshot`
- `db_query`, `db_schema`
- `analyze_image`, `desktop_screenshot`

These tools also get a higher overflow threshold (8000 chars vs 2000) and longer previews (4000 chars vs 400) because tasks like web audits, scraping, and HTML analysis need the full content.

**Non-critical tools** (read_file, list_files, run_command, etc.) are compressed aggressively since their outputs can easily be re-fetched.

### 3. Workspace Knowledge Auto-Loading
On every `agent.init()`, the system reads:
- `SOUL.md` — behavioral guidelines
- `TOOLS.md` — tool usage patterns and gotchas
- `AGENTS.md` — delegation patterns
- `MEMORY.md` — persistent project facts
- Today's `memory/YYYY-MM-DD.md` — daily session log
- Last 20 lines of `.learnings/LEARNINGS.md`

These are injected into the system prompt as `═══ WORKSPACE KNOWLEDGE ═══`.

### 4. Workspace Tools
The agent can now programmatically update its knowledge:
- `workspace_save_fact` — add to MEMORY.md (e.g., "This project uses TypeScript")
- `workspace_log_learning` — log an insight
- `workspace_log_error` — log an error pattern + solution
- `workspace_daily_log` — log session progress

---

## Customization

### Editing SOUL.md
Edit `~/.agent/workspace/SOUL.md` to change the agent's behavioral rules. This is loaded into every session automatically. Add project-specific rules here.

### Editing TOOLS.md
Edit `~/.agent/workspace/TOOLS.md` to add tool usage tips or document gotchas specific to your workflow.

### Tuning Parameters
In `src/memory/summary.js`:
- `SUMMARY_THRESHOLD` — when to trigger summarization (default: 40000 tokens)
- `MESSAGES_TO_KEEP` — how many recent messages to preserve (default: 15)

In `src/agent.js`:
- `_taskAnchorInterval` — how often to re-inject the task goal (default: every 5 tool calls)
- `MAX_OUTPUT_LENGTH` — max tool output size before offloading (default: 2000 chars)
- `staleThreshold` — how many recent messages keep full tool output (default: 15)
