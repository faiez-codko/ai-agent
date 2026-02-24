# Agent Memory & Context Architecture — v3.0

## What Changed (v3.0)

### Problem (v2.0 → v3.0)
After v2.0 improvements, the agent was STILL hallucinating after ~55 tool calls:

```
📌 Task anchor injected after 55 tool calls
AI: null                                          ← model returned nothing
⚠️  Memory usage high (~65239 tokens). Summarizing...
Archived 274 messages                             ← old messages destroyed
✅ Reduced from 289 to 17 messages
AI: "What were A B C D again?"                    ← AMNESIA
```

### Root Causes & Fixes (v3.0)

| Issue | Root Cause | Fix |
|-------|-----------|-----|
| Vague task anchor | Anchor stored raw user text: `"do all those A B C D"` — meaningless without context | **Smart Task Anchor** — captures the AI's first expanded response as the anchor |
| Summary killed task context | Summarizer compressed 274 msgs to 17, losing what A/B/C/D meant | **Pre-Summary Task Save** — writes full task state to `.agent/{id}/active_task.md` before summarizing |
| Summary prompt too generic | "Summarize this conversation" lost critical task details | **Task-Aware Summary Prompt** — forces structured output: CURRENT TASK / COMPLETED / IN PROGRESS / KEY FACTS |
| Post-summary amnesia | No task re-injection after summarization | **Active Task Injection** — after summary, re-injects the original request + tool call count |
| No checkpoints | 55 tool calls with no state saved to disk | **Forced Checkpoints** — saves task state to file every 30 tool calls |
| Agent doesn't save learnings | Workspace memory tools exist but AI never calls them | **Mandatory Save Triggers** — system prompt gives explicit WHEN+HOW examples |
| Large tool output | File-based overflow was messy | **SQLite Offloading** — logs full output to DB, keeps preview in context |
| Data persistence | File cleanup was manual/incomplete | **DB Storage** — structured storage in `tool_executions` table |

---

## Architecture Overview

### Memory Layers

```
┌──────────────────────────────────────────────────────────────┐
│                    SYSTEM PROMPT                              │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐                   │
│  │ SOUL.md  │  │ TOOLS.md │  │AGENTS.md │  (Identity)        │
│  └──────────┘  └──────────┘  └──────────┘                   │
│  ┌──────────────────────┐  ┌─────────────────┐               │
│  │     MEMORY.md        │  │ Daily Memory    │  (Facts)       │
│  │  (Persistent Facts)  │  │ (YYYY-MM-DD.md) │               │
│  └──────────────────────┘  └─────────────────┘               │
│  ┌──────────────────────────────────────────┐                │
│  │         Persona System Prompt            │  (Role)         │
│  └──────────────────────────────────────────┘                │
└──────────────────────────────────────────────────────────────┘
                          ▼
┌──────────────────────────────────────────────────────────────┐
│                 CONVERSATION MEMORY                           │
│                                                               │
│  [User: "do all those A B C D"]                              │
│      ▼                                                        │
│  [AI: "I'll handle: A=login, B=auth, C=DB, D=deploy"]       │
│  ← _expandedTaskGoal captured here                           │
│      ▼                                                        │
│  [Tool Call #1] → [Tool Result (full)]                       │
│  ...                                                          │
│  [Tool Call #5] → [SMART ANCHOR with expanded understanding] │
│  [Tool Call #6...#29] → working...                           │
│  [Tool Call #30] → 💾 CHECKPOINT saved to active_task.md     │
│  ...                                                          │
│  [Tool Call #55] → tokens hit 40k → SUMMARIZE               │
│     1. Save task state to active_task.md                     │
│     2. Archive old messages to .agent/archive/               │
│     3. Generate structured summary (TASK/DONE/NEXT/FACTS)    │
│     4. Re-inject: [ACTIVE TASK] + original request           │
│     5. Keep last 15 messages raw                             │
│                                                               │
│  [Tool Call Output] → [PREVIEW (400 chars)] + [DB ID]       │
│                                                               │
│  IF tokens > 40k → SUMMARIZE                                │
│  IF tokens > 120k → FALLBACK: keep only last 10-20 msgs     │
└──────────────────────────────────────────────────────────────┘
                          ▼
┌──────────────────────────────────────────────────────────────┐
│               PERSISTENT STORAGE                              │
│                                                               │
│  SQLite DB (.agent/.ai-agent-chat.sqlite)                    │
│    ├── agents / chat_sessions / chat (messages)              │
│    └── tool_executions (full output storage)                 │
│                                                               │
│  Workspace Files (~/.agent/workspace/)                        │
│    ├── SOUL.md        (identity + behavioral rules)          │
│    ├── TOOLS.md       (tool usage patterns)                  │
│    ├── AGENTS.md      (delegation patterns)                  │
│    ├── MEMORY.md      (persistent facts)                     │
│    ├── memory/                                                │
│    │   └── YYYY-MM-DD.md (daily session logs)                │
│    └── .learnings/                                            │
│        ├── LEARNINGS.md  (insights)                          │
│        ├── ERRORS.md     (error patterns)                    │
│        └── FEATURE_REQUESTS.md                               │
│                                                               │
│  Task State (.agent/{agentId}/active_task.md)                │
│    └── Survives summarization — contains original request,   │
│        initial plan, recent tool activity, tool call count    │
│                                                               │
│  Archive (.agent/archive/)                                    │
│    └── <agent>_<timestamp>.json                              │
└──────────────────────────────────────────────────────────────┘
```

---

## Key Anti-Hallucination Mechanisms

### 1. Smart Task Anchoring (NEW in v3.0)

**Before (v2.0):** Anchor repeated the raw user message — useless for vague requests
```
[TASK ANCHOR] Your CURRENT GOAL is: "do all those A B C D"  ← USELESS
```

**After (v3.0):** Anchor captures the AI's first expanded understanding
```
[TASK ANCHOR — Reminder #3]
Original request: "do all those A B C D"
Your expanded understanding: I'll implement:
A) Build the login page with email/password form
B) Add JWT authentication middleware
C) Set up PostgreSQL database with user table
D) Deploy to Railway with CI/CD pipeline
Tool calls so far: 15. Stay focused. What is the NEXT step?
```

### 2. Pre-Summarization Task Save

Before compressing memory, the system saves a snapshot of the current task to disk:

```
.agent/primary/active_task.md
├── # Active Task State
├── ## Original Goal
│   "do all those A B C D"
├── ## Full Original Request  
│   (complete first user message)
├── ## Initial Plan/Understanding
│   (AI's first response with expanded details)
├── ## Recent Tool Activity (last 20 calls)
│   - write_file: Created src/auth/login.tsx...
│   - run_command: npm run build...
└── ## Stats
    - Total tool calls: 55
    - Saved at: 2026-02-19T09:19:43Z
```

This file is written **before** the summarizer runs, so even if the summary is mediocre, the task context survives.

### 3. Task-Aware Summarization Prompt

The summarizer now generates a **structured** summary:

```
1. **CURRENT TASK**: Build 4 features (A: login, B: auth, C: DB, D: deploy)
2. **COMPLETED SO FAR**: A done (login.tsx), B done (middleware)
3. **IN PROGRESS / NEXT**: C — Setting up PostgreSQL schema
4. **KEY FACTS**: Using Next.js 14, PostgreSQL, Railway for deploy
5. **BLOCKED / ISSUES**: None
```

### 4. Post-Summarization Active Task Injection

After summarization, the system injects:
```
[ACTIVE TASK — DO NOT FORGET]: "do all those A B C D"
Full original request: "do all those A B C D" 
You have made 55 tool calls so far. Continue from where you left off.
```

### 5. Forced Checkpoints (every 30 tool calls)

At tool call #30, #60, #90, the system auto-saves `active_task.md` to disk — no AI decision needed.

### 6. Workspace Memory — Mandatory Saves

All personas now have a `## MANDATORY SAVES` section with explicit triggers:
```
Learned the project's tech stack? → workspace_save_fact('Project Facts', 'Uses Next.js 14')
Fixed a tricky bug? → workspace_log_error('CORS error', 'Added middleware header')
Found a data source? → workspace_save_fact('Data Sources', 'clutch.co has B2B profiles')
```

### 7. Tool Output Offloading (Improved)

When a tool returns large output:
```
[SYSTEM: Full output saved to file (5000 chars). Below is a preview.
Full path: C:/project/.agent/overflow/overflow_2026-02-19_read_file.txt
To read the full output, call: read_file({ path: "C:/project/.agent/overflow/overflow_..." })

Preview:
const express = require('express');
const app = express();
...]
```

Auto-cleanup keeps only the 50 most recent overflow files.

---

## Multi-Agent System

### Agents

| Agent ID | Name | Role | Temp |
|----------|------|------|------|
| `default` | Polly (primary) | Orchestrator — delegates + handles general tasks | 0.5 |
| `web_scraper` | scraper | Web scraping, data extraction, site audits | 0.3 |
| `coder` | coder | Full-stack dev, debugging, architecture | 0.3 |
| `b2b_leadgen` | leadgen | B2B lead research, contact scraping, list building | 0.4 |

### Delegation Flow
```
User → Polly (primary)
         ├── delegate_task("scraper", "Scrape prices from example.com")
         ├── delegate_task("coder", "Refactor auth to use JWT")
         └── delegate_task("leadgen", "Find 50 SaaS companies in US")
```

---

## Files

### New Files (v3.0)
| File | Purpose |
|------|---------|
| `src/personas/web_scraper.json` | Web scraping specialist persona |
| `src/personas/coder.json` | Coding specialist persona |
| `src/personas/b2b_leadgen.json` | B2B lead gen specialist persona |

### Modified Files (v3.0)
| File | Changes |
|------|---------|
| `src/agent.js` | Smart task anchor, forced checkpoints, overflow cleanup, actionable overflow message |
| `src/memory/summary.js` | Pre-summary task save, task-aware summarization prompt, post-summary task injection |
| `src/memory/workspace.js` | Updated AGENTS.md template for multi-agent system |
| `src/personas/default.json` | Mandatory save triggers, delegation rules, offloaded output guidance |
| `src/interactive.js` | Multi-agent initialization (scraper, coder, leadgen) |

### Previous Files (v2.0)
| File | Purpose |
|------|---------|
| `src/memory/workspace.js` | Workspace memory system — loads/saves/prunes workspace files |
| `src/tools/workspace_memory.js` | Tool definitions for workspace logging |

---

## Tuning Parameters

In `src/memory/summary.js`:
- `SUMMARY_THRESHOLD` — when to trigger summarization (default: 40000 tokens)
- `MESSAGES_TO_KEEP` — how many recent messages to preserve (default: 15)

In `src/agent.js`:
- `_taskAnchorInterval` — how often to inject smart anchor (default: every 5 tool calls)
- `CHECKPOINT_INTERVAL` — how often to force save task state (default: every 30 tool calls)
- `MAX_OUTPUT_LENGTH` — max tool output before offloading (2000 chars normal, 8000 for critical tools)
- `staleThreshold` — messages from end to keep full tool output (default: 15)
