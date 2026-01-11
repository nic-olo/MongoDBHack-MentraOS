# Implementation Design

This document describes the complete system architecture and implementation details.

## System Overview

The MentraOS Desktop Daemon system enables AI agents to run on a user's local machine, orchestrated by a cloud-based MasterAgent. Users interact via AR glasses or webview, and the system intelligently decides how to handle each query.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              USER INTERFACES                                 │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│   👓 AR Glasses                              💻 Webview                      │
│   - Voice input                             - Text input                    │
│   - Short display (glassesDisplay)          - Full display (webviewContent) │
│   - Spoken responses                        - Markdown rendering            │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    │ POST /api/master-agent/query
                                    │ GET  /api/master-agent/task/:id (polling)
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                              CLOUD SERVER                                    │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                         MasterAgent                                  │   │
│  │                                                                      │   │
│  │  Models:                                                             │   │
│  │  - Haiku 4.5 (fast): Decisions, simple responses, tool calls        │   │
│  │  - Sonnet 4.5 (smart): Goal formulation, synthesis                  │   │
│  │                                                                      │   │
│  │  Decision Flow:                                                      │   │
│  │  1. direct_response   → Answer immediately (knowledge questions)    │   │
│  │  2. clarifying_question → Ask for more info (vague requests)        │   │
│  │  3. spawn_agent       → Run terminal agent (code tasks)             │   │
│  │                                                                      │   │
│  │  Tools (sandboxed to userId):                                       │   │
│  │  - get_recent_tasks()                                               │   │
│  │  - get_running_agents()                                             │   │
│  │  - get_agent_status(agentId)                                        │   │
│  │  - get_daemon_status()                                              │   │
│  │  - get_conversation_summary()                                       │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│       │                           │                           │             │
│       ▼                           ▼                           ▼             │
│  ┌──────────────┐    ┌─────────────────────┐    ┌────────────────────┐     │
│  │ Conversation │    │   DaemonManager     │    │     MongoDB        │     │
│  │   Service    │    │                     │    │                    │     │
│  │              │    │ - WebSocket to      │    │ - tasks            │     │
│  │ - History    │    │   daemons           │    │ - subagents        │     │
│  │ - Context    │    │ - spawnAgent()      │    │ - conversations    │     │
│  │ - Turns      │    │ - killAgent()       │    │                    │     │
│  └──────────────┘    └─────────────────────┘    └────────────────────┘     │
│                               │                                             │
└───────────────────────────────│─────────────────────────────────────────────┘
                                │
                                │ WebSocket: spawn_agent, kill_agent
                                │ REST: status updates, completion
                                ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                         USER'S DESKTOP MACHINE                               │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                       Desktop Daemon                                 │   │
│  │                                                                      │   │
│  │  ┌─────────────┐     ┌─────────────┐     ┌─────────────────────┐   │   │
│  │  │ DaemonClient│────▶│  AgentPool  │────▶│   TerminalAgent     │   │   │
│  │  │             │     │             │     │                     │   │   │
│  │  │ - WebSocket │     │ - spawn()   │     │ - PTY terminal      │   │   │
│  │  │ - REST      │     │ - kill()    │     │ - Claude CLI        │   │   │
│  │  │ - Heartbeat │     │ - manage    │     │ - LLM Observer      │   │   │
│  │  └─────────────┘     └─────────────┘     └─────────────────────┘   │   │
│  │                                                   │                 │   │
│  │                                                   ▼                 │   │
│  │                                          ┌─────────────────────┐   │   │
│  │                                          │   LLM Observer      │   │   │
│  │                                          │   (Gemini Flash)    │   │   │
│  │                                          │                     │   │   │
│  │                                          │ States: ready,      │   │   │
│  │                                          │ working, completed, │   │   │
│  │                                          │ needs_approval,     │   │   │
│  │                                          │ error               │   │   │
│  │                                          └─────────────────────┘   │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Query Processing Flow

### Non-Blocking Request/Response

```
Client                          Server                         Background
  │                               │                               │
  │ POST /query {userId, query}   │                               │
  │──────────────────────────────▶│                               │
  │                               │ 1. Create task in MongoDB     │
  │                               │ 2. Return taskId immediately  │
  │◀──────────────────────────────│                               │
  │ { taskId, status: processing }│                               │
  │                               │──────────────────────────────▶│
  │                               │ 3. Process query async        │
  │                               │    - Load conversation        │
  │                               │    - MasterAgent decides      │
  │ GET /task/:id (polling)       │    - Execute decision         │
  │──────────────────────────────▶│    - Save result              │
  │◀──────────────────────────────│                               │
  │ { status: processing }        │                               │
  │                               │                               │
  │ GET /task/:id (polling)       │◀──────────────────────────────│
  │──────────────────────────────▶│ 4. Task completed             │
  │◀──────────────────────────────│                               │
  │ { status: completed,          │                               │
  │   result: { glassesDisplay,   │                               │
  │             webviewContent }} │                               │
```

### MasterAgent Decision Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                    MasterAgent.processQuery()                    │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Input: query, conversationHistory                              │
│                                                                 │
│  ┌───────────────────────────────────────────────────────────┐ │
│  │ Step 1: Decide Action (Haiku 4.5 - fast)                  │ │
│  │                                                           │ │
│  │ Claude analyzes query + history and chooses:              │ │
│  │                                                           │ │
│  │ ┌─────────────────┐ ┌─────────────────┐ ┌──────────────┐ │ │
│  │ │ direct_response │ │clarifying_question│ │ spawn_agent │ │ │
│  │ │                 │ │                 │ │              │ │ │
│  │ │ "What is React?"│ │ "Fix the bug"   │ │"Fix auth bug"│ │ │
│  │ │ → Just answer   │ │ → Which bug?    │ │ → Run agent  │ │ │
│  │ └────────┬────────┘ └────────┬────────┘ └──────┬───────┘ │ │
│  └──────────│───────────────────│─────────────────│─────────┘ │
│             │                   │                 │           │
│             ▼                   ▼                 ▼           │
│  ┌──────────────────┐ ┌──────────────────┐ ┌──────────────┐  │
│  │ Return response  │ │ Return question  │ │ Step 2:      │  │
│  │ immediately      │ │ immediately      │ │ Formulate    │  │
│  │                  │ │                  │ │ Goal         │  │
│  │ glassesDisplay:  │ │ glassesDisplay:  │ │ (Sonnet 4.5) │  │
│  │ "React is a UI   │ │ "Which file has  │ │              │  │
│  │  library..."     │ │  the bug?"       │ └──────┬───────┘  │
│  │                  │ │                  │        │          │
│  │ webviewContent:  │ │ webviewContent:  │        ▼          │
│  │ "# React\n..."   │ │ "I'd be happy    │ ┌──────────────┐  │
│  │                  │ │  to help..."     │ │ Step 3:      │  │
│  └──────────────────┘ └──────────────────┘ │ Spawn Agent  │  │
│                                            │              │  │
│                                            │ DaemonMgr.   │  │
│                                            │ spawnAgent() │  │
│                                            └──────┬───────┘  │
│                                                   │          │
│                                                   ▼          │
│                                            ┌──────────────┐  │
│                                            │ Step 4:      │  │
│                                            │ Wait for     │  │
│                                            │ completion   │  │
│                                            │ (poll DB)    │  │
│                                            └──────┬───────┘  │
│                                                   │          │
│                                                   ▼          │
│                                            ┌──────────────┐  │
│                                            │ Step 5:      │  │
│                                            │ Synthesize   │  │
│                                            │ result       │  │
│                                            │ (Sonnet 4.5) │  │
│                                            │              │  │
│                                            │ glassesDisplay│ │
│                                            │ webviewContent│ │
│                                            └──────────────┘  │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

---

## MongoDB Schema

### Collection: `tasks`

```javascript
{
  _id: ObjectId,
  taskId: "task_1234567890_abc123",
  userId: "user@example.com",
  conversationId: "conv_user@example.com_1234567890",
  
  // Input
  query: "Fix the authentication bug in login.ts",
  
  // Status
  status: "processing" | "completed" | "failed",
  
  // Result (when completed)
  result: {
    type: "direct_response" | "clarifying_question" | "agent_result",
    glassesDisplay: "Fixed auth bug. Tests pass.",     // Short for AR
    webviewContent: "# Auth Bug Fix\n\n## Changes...", // Full markdown
    agentId: "agent_xyz",         // If agent was spawned
    agentResult: { ... }          // Raw agent output
  },
  
  // Error (if failed)
  error: "Error message",
  
  // Metrics
  processingTimeMs: 45000,
  agentSpawned: true,
  
  // Timestamps
  createdAt: ISODate,
  updatedAt: ISODate,
  completedAt: ISODate
}
```

### Collection: `conversations`

```javascript
{
  _id: ObjectId,
  conversationId: "conv_user@example.com_1234567890",
  userId: "user@example.com",
  
  turns: [
    {
      role: "user",
      content: "Fix the auth bug in login.ts",
      timestamp: ISODate
    },
    {
      role: "assistant",
      content: "I've fixed the authentication bug...",
      glassesDisplay: "Fixed auth bug. Tests pass.",
      type: "agent_result",
      taskId: "task_123",
      timestamp: ISODate
    }
  ],
  
  createdAt: ISODate,
  updatedAt: ISODate,
  lastActiveAt: ISODate
}

// Limits:
// - MAX_TURNS: 20 (keeps last 20 messages)
// - CONVERSATION_TIMEOUT: 4 hours (new conversation after inactivity)
```

### Collection: `subagents`

```javascript
{
  _id: ObjectId,
  agentId: "agent_1234567890_abc123",
  
  // Ownership
  daemonId: "daemon_user@example.com",
  userId: "user@example.com",
  sessionId: "master_1234567890",
  
  // Agent info
  type: "terminal",
  goal: "Fix the authentication bug in login.ts...",
  workingDirectory: "/Users/example/project",
  
  // Status
  status: "pending" | "initializing" | "running" | "completed" | "failed" | "cancelled",
  currentStep: "Claude is analyzing the codebase...",
  notes: ["Started Claude CLI", "Goal submitted", "Working..."],
  
  // Result
  result: "Fixed the bug by...",
  error: null,
  executionTimeMs: 45000,
  
  // Timestamps
  createdAt: ISODate,
  startedAt: ISODate,
  updatedAt: ISODate,
  completedAt: ISODate
}
```

---

## MasterAgent Tools

Tools are sandboxed to the authenticated user. The `userId` is injected server-side and cannot be overridden by Claude.

```typescript
class MasterAgentTools {
  private userId: string;  // Immutable, set at construction
  
  constructor(userId: string) {
    this.userId = userId;
  }
  
  // All queries automatically filtered by this.userId
  async get_recent_tasks({ limit, status }) { ... }
  async get_running_agents() { ... }
  async get_agent_status({ agentId }) { ... }
  async get_daemon_status() { ... }
  async get_conversation_summary({ turns }) { ... }
}
```

### Tool Definitions

| Tool | Description | Parameters |
|------|-------------|------------|
| `get_recent_tasks` | Get user's recent tasks | `limit?: number, status?: string` |
| `get_running_agents` | Get currently running agents | none |
| `get_agent_status` | Get specific agent details | `agentId: string` |
| `get_daemon_status` | Check if daemon is online | none |
| `get_conversation_summary` | Get conversation context | `turns?: number` |

### Security Model

```
❌ WRONG - Prompt injectable:
   Claude could call: get_tasks({ userId: "other@email.com" })

✅ CORRECT - Server injects userId:
   Claude calls: get_recent_tasks({ limit: 5 })
   Server executes: db.find({ userId: this.userId, ... })
```

---

## Model Configuration

```typescript
const MODELS = {
  // Fast model - decisions, simple responses, tool calls
  fast: 'claude-haiku-4-5-20251001',
  
  // Smart model - goal formulation, synthesis
  smart: 'claude-sonnet-4-5-20250929',
};

// Cost per 1M tokens:
// Haiku 4.5:  $1 input,  $5 output
// Sonnet 4.5: $3 input, $15 output
```

### When to Use Each Model

| Task | Model | Why |
|------|-------|-----|
| Decision (direct/clarify/spawn) | Haiku | Fast, simple classification |
| Direct responses | Haiku | Quick answers |
| Clarifying questions | Haiku | Simple questions |
| Tool calls | Haiku | Fast lookups |
| Goal formulation | Sonnet | Detailed, precise goals |
| Result synthesis | Sonnet | Quality summarization |

---

## File Structure

```
src/server/
├── db/
│   └── mongo.ts                    # MongoDB connection + indexes
├── daemon/
│   ├── DaemonManager.ts            # WebSocket + agent management
│   ├── routes.ts                   # REST endpoints
│   ├── types.ts                    # Type definitions
│   └── index.ts                    # Exports
├── conversation/
│   ├── ConversationService.ts      # Conversation history management
│   ├── types.ts                    # Conversation types
│   └── index.ts                    # Exports
├── master-agent/
│   ├── MasterAgent.ts              # Main orchestrator
│   ├── MasterAgentTools.ts         # Sandboxed tools
│   ├── models.ts                   # Model configuration
│   ├── types.ts                    # Types
│   └── index.ts                    # Exports
├── routes/
│   └── routes.ts                   # API routes
└── index.ts                        # Server entry point

daemon/
├── src/
│   ├── index.ts                    # Daemon entry point
│   ├── daemon-client.ts            # WebSocket + REST client
│   ├── agent-pool.ts               # Agent management
│   ├── terminal-agent.ts           # Claude CLI in PTY
│   ├── observer.ts                 # LLM observer (Gemini)
│   ├── config.ts                   # Config storage
│   └── types.ts                    # Types
└── package.json
```

---

## API Endpoints

### Frontend → Server

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/master-agent/query` | Submit query (returns taskId) |
| GET | `/api/master-agent/task/:taskId` | Poll for result |
| GET | `/api/master-agent/health` | Health check |

### Daemon → Server

| Method | Path | Description |
|--------|------|-------------|
| POST | `/daemon-api/daemon/heartbeat` | Daemon health check |
| POST | `/daemon-api/subagent/:id/status` | Agent status update |
| POST | `/daemon-api/subagent/:id/complete` | Agent completion |
| POST | `/daemon-api/subagent/:id/log` | Log streaming |

### WebSocket

| Path | Direction | Description |
|------|-----------|-------------|
| `/ws/daemon?email=...` | Server ← Daemon | Daemon connects |
| `spawn_agent` | Server → Daemon | Create agent |
| `kill_agent` | Server → Daemon | Stop agent |

---

## Environment Variables

```bash
# Server
PORT=3001
MONGODB_URI=mongodb+srv://...
ANTHROPIC_API_KEY=sk-ant-...

# Daemon
GEMINI_API_KEY=AIza...
DAEMON_SERVER_URL=http://localhost:3001

# MentraOS
PACKAGE_NAME=com.mentra.soga
MENTRAOS_API_KEY=...
```

---

## Dual Output Format

Every response includes both formats:

| Field | Target | Format | Max Length |
|-------|--------|--------|------------|
| `glassesDisplay` | AR Glasses | Plain text, 1-2 sentences | ~100 chars |
| `webviewContent` | Web UI | Markdown, full detail | Unlimited |

Example:
```json
{
  "glassesDisplay": "Fixed auth bug. Tests pass.",
  "webviewContent": "# Auth Bug Fix\n\n## Problem\nThe login function wasn't hashing passwords...\n\n## Changes\n- Modified `src/auth.ts` line 42\n- Added bcrypt comparison\n\n## Tests\n✓ 12 tests passing"
}
```

---

## Commands Reference

```bash
# Start server
cd bun-agent
bun run dev:backend

# Start daemon (separate terminal)
cd bun-agent
GEMINI_API_KEY=your_key bun run daemon

# Test spawn (separate terminal)
curl -X POST http://localhost:3001/daemon-api/test/spawn \
  -H "Content-Type: application/json" \
  -d '{"email": "your@email.com", "goal": "What is 2+2?"}'

# Poll result
curl http://localhost:3001/daemon-api/test/agent/AGENT_ID

# Check connected daemons
curl http://localhost:3001/daemon-api/test/daemons
```
