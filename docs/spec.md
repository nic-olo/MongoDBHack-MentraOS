# MentraOS Desktop Daemon & Sub-Agent System - Specification

## Project Overview

This project enables AI coding agents to run on a user's desktop machine, orchestrated by a cloud-based MasterAgent. Users interact via AR glasses or webview, and the system intelligently decides how to handle each query.

### The Problem

When a user speaks a command like "fix the bug in auth.ts", the MasterAgent needs to:
1. Understand the request and conversation context
2. Decide: answer directly, ask for clarification, or run code on user's machine
3. If needed, run Claude CLI on the user's actual machine (where their code lives)
4. Report results back in appropriate format for glasses and webview

### The Solution

A **Desktop Daemon** runs on the user's machine and connects to the cloud server. The **MasterAgent** intelligently routes queries - answering simple questions directly, asking for clarification when needed, and only spawning terminal agents for actual code tasks.

---

## System Components

### 1. MasterAgent (Cloud)

The intelligent orchestrator that processes user queries.

**Models:**
- **Claude Haiku 4.5** (`claude-haiku-4-5-20251001`) - Fast decisions, simple responses
- **Claude Sonnet 4.5** (`claude-sonnet-4-5-20250929`) - Complex goals, synthesis

**Decision Flow:**
```
Query → MasterAgent → Decision:
  ├─ direct_response      → Answer immediately (knowledge questions)
  ├─ clarifying_question  → Ask for more info (vague requests)
  └─ spawn_agent          → Run terminal agent (code tasks)
```

**Features:**
- Conversation history (remembers previous exchanges)
- Tool use (query user's tasks, agents, daemon status)
- Dual output (short for glasses, full for webview)

### 2. ConversationService (Cloud)

Manages conversation history per user.

**Features:**
- Stores conversation turns in MongoDB
- Auto-expires after 4 hours of inactivity
- Keeps last 20 turns (to avoid token limits)
- Provides formatted history for MasterAgent prompts

### 3. MasterAgentTools (Cloud)

Sandboxed tools that MasterAgent can use to query context.

**Available Tools:**
| Tool | Description |
|------|-------------|
| `get_recent_tasks` | User's recent tasks and results |
| `get_running_agents` | Currently active terminal agents |
| `get_agent_status` | Specific agent details |
| `get_daemon_status` | Is user's daemon online? |
| `get_conversation_summary` | Conversation context |

**Security:** All tools are sandboxed - `userId` is injected server-side and cannot be overridden by Claude (prevents prompt injection).

### 4. DaemonManager (Cloud)

Manages WebSocket connections to desktop daemons.

**Responsibilities:**
- Accept daemon WebSocket connections
- Send commands: `spawn_agent`, `kill_agent`
- Receive status updates via REST
- Persist agent state to MongoDB
- Emit events for MasterAgent

### 5. Desktop Daemon (User's Machine)

Runs on user's machine, executes terminal agents.

**Components:**
- **DaemonClient** - WebSocket + REST connection to cloud
- **AgentPool** - Manages multiple concurrent agents
- **TerminalAgent** - Runs Claude CLI in PTY terminal
- **LLM Observer** - Gemini Flash for intelligent state detection

### 6. TerminalAgent (User's Machine)

Controls Claude CLI through a PTY terminal.

**Features:**
- Spawns Claude CLI in pseudo-terminal
- Submits goal, monitors output
- Auto-approves permission prompts (configurable)
- Uses LLM Observer for state detection
- Reports status/completion back to server

### 7. LLM Observer (User's Machine)

Uses Gemini Flash to intelligently detect terminal state.

**States Detected:**
- `initializing` - Claude CLI starting up
- `ready` - Waiting for input
- `working` - Actively processing
- `needs_approval` - Asking permission (y/n)
- `completed` - Task done
- `error` - Something went wrong

**Actions Returned:**
- `wait` - Keep monitoring
- `send_approval` - Send "y" to approve
- `report_complete` - Task is done
- `report_error` - Task failed

---

## Data Flow

### Complete End-to-End Flow

```
1. User (Glasses): "Fix the auth bug in login.ts"
                    │
                    ▼
2. Voice → Transcription → POST /api/master-agent/query
   { userId: "user@email.com", query: "Fix the auth bug..." }
                    │
                    ▼
3. Server: Create task in MongoDB, return taskId immediately
   Response: { taskId: "task_123", status: "processing" }
                    │
                    ▼
4. Background: Load conversation history from MongoDB
                    │
                    ▼
5. MasterAgent.processQuery() with Haiku 4.5
   - Has conversation context
   - Has tools available
   - Decides: SPAWN_AGENT (clear code task)
                    │
                    ▼
6. Formulate detailed goal with Sonnet 4.5
   Goal: "Fix the authentication bug in login.ts..."
                    │
                    ▼
7. DaemonManager.spawnAgent() → WebSocket → User's Daemon
                    │
                    ▼
8. TerminalAgent runs Claude CLI on user's machine
   - PTY terminal
   - LLM Observer watches state
   - Auto-approves actions
   - Status updates → REST → Server → MongoDB
                    │
                    ▼
9. Agent completes → Result saved to MongoDB
                    │
                    ▼
10. MasterAgent synthesizes result with Sonnet 4.5
    - glassesDisplay: "Fixed auth bug. Tests pass."
    - webviewContent: "# Auth Bug Fix\n\n## Changes..."
                    │
                    ▼
11. Save to MongoDB:
    - Update task with result
    - Add turns to conversation
                    │
                    ▼
12. Client polling: GET /api/master-agent/task/task_123
    Response: { status: "completed", result: { glassesDisplay, webviewContent }}
                    │
                    ├──────────────────────┐
                    ▼                      ▼
    👓 Glasses:                  💻 Webview:
    "Fixed auth bug.            # Auth Bug Fix
     Tests pass."               ## Changes
                                - Modified login.ts line 42...
```

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
  │ GET /task/:id (polling)       │                               │
  │──────────────────────────────▶│                               │
  │◀──────────────────────────────│                               │
  │ { status: processing }        │                               │
  │                               │                               │
  │ GET /task/:id (polling)       │◀──────────────────────────────│
  │──────────────────────────────▶│ 4. Task completed             │
  │◀──────────────────────────────│                               │
  │ { status: completed, result } │                               │
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
    glassesDisplay: "Fixed auth bug. Tests pass.",
    webviewContent: "# Auth Bug Fix\n\n## Changes...",
    agentId: "agent_xyz",
    agentResult: { ... }
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

## API Endpoints

### Frontend → Server

| Method | Path | Description | Request | Response |
|--------|------|-------------|---------|----------|
| POST | `/api/master-agent/query` | Submit query | `{ userId, query }` | `{ taskId, status }` |
| GET | `/api/master-agent/task/:taskId` | Poll for result | - | `{ status, result }` |
| GET | `/api/master-agent/health` | Health check | - | `{ status }` |

### Daemon → Server

| Method | Path | Description |
|--------|------|-------------|
| POST | `/daemon-api/daemon/heartbeat` | Daemon health check |
| POST | `/daemon-api/subagent/:id/status` | Agent status update |
| POST | `/daemon-api/subagent/:id/complete` | Agent completion |
| POST | `/daemon-api/subagent/:id/log` | Log streaming |
| GET | `/daemon-api/daemon/status` | Get daemon's own status |

### Test Endpoints (No Auth)

| Method | Path | Description |
|--------|------|-------------|
| POST | `/daemon-api/test/spawn` | Spawn agent on daemon |
| GET | `/daemon-api/test/agent/:id` | Get agent status |
| GET | `/daemon-api/test/daemons` | List connected daemons |

### WebSocket

| Path | Direction | Description |
|------|-----------|-------------|
| `/ws/daemon?email=...` | Server ← Daemon | Daemon connects |
| `spawn_agent` message | Server → Daemon | Create new agent |
| `kill_agent` message | Server → Daemon | Stop agent |
| `ping/pong` | Bidirectional | Connection health |

---

## Dual Output Format

Every response includes both formats for different display contexts:

| Field | Target | Format | Max Length | Example |
|-------|--------|--------|------------|---------|
| `glassesDisplay` | AR Glasses | Plain text | ~100 chars | "Fixed auth bug. Tests pass." |
| `webviewContent` | Web UI | Markdown | Unlimited | "# Auth Bug Fix\n\n## Changes..." |

### Response Type Examples

**Direct Response:**
```json
{
  "type": "direct_response",
  "glassesDisplay": "React is a UI library by Meta for building web interfaces.",
  "webviewContent": "# React\n\nReact is a JavaScript library for building user interfaces..."
}
```

**Clarifying Question:**
```json
{
  "type": "clarifying_question",
  "glassesDisplay": "Which file has the bug?",
  "webviewContent": "I'd be happy to help fix the bug. Could you tell me:\n1. Which file?\n2. What's the error?"
}
```

**Agent Result:**
```json
{
  "type": "agent_result",
  "glassesDisplay": "Fixed auth bug. All tests passing.",
  "webviewContent": "# Auth Bug Fix\n\n## Problem\nThe login function...\n\n## Changes\n- Modified line 42...",
  "agentId": "agent_123"
}
```

---

## Environment Variables

### Server
```bash
PORT=3001
MONGODB_URI=mongodb+srv://...
ANTHROPIC_API_KEY=sk-ant-...
```

### Daemon
```bash
GEMINI_API_KEY=AIza...
DAEMON_SERVER_URL=http://localhost:3001
```

### MentraOS
```bash
PACKAGE_NAME=com.mentra.soga
MENTRAOS_API_KEY=...
```

---

## File Structure

```
bun-agent/
├── daemon/                         # Desktop daemon (runs on user's machine)
│   ├── src/
│   │   ├── index.ts                # Entry point, CLI commands
│   │   ├── daemon-client.ts        # WebSocket + REST client
│   │   ├── agent-pool.ts           # Manages multiple agents
│   │   ├── terminal-agent.ts       # Claude CLI in PTY
│   │   ├── observer.ts             # LLM observer (Gemini Flash)
│   │   ├── config.ts               # Config storage (~/.desktop-daemon/)
│   │   └── types.ts                # Type definitions
│   └── package.json
│
├── src/
│   ├── server/
│   │   ├── db/
│   │   │   └── mongo.ts            # MongoDB connection
│   │   ├── daemon/
│   │   │   ├── DaemonManager.ts    # WebSocket + agent management
│   │   │   ├── routes.ts           # REST endpoints
│   │   │   ├── types.ts            # Type definitions
│   │   │   └── index.ts            # Exports
│   │   ├── conversation/
│   │   │   ├── ConversationService.ts  # Conversation history
│   │   │   ├── types.ts            # Conversation types
│   │   │   └── index.ts            # Exports
│   │   ├── master-agent/
│   │   │   ├── MasterAgent.ts      # Main orchestrator
│   │   │   ├── MasterAgentTools.ts # Sandboxed tools
│   │   │   ├── models.ts           # Model configuration
│   │   │   ├── types.ts            # Types
│   │   │   └── index.ts            # Exports
│   │   ├── routes/
│   │   │   └── routes.ts           # API routes
│   │   └── index.ts                # Server entry point
│   └── frontend/                   # React webview
│
├── docs/
│   ├── spec.md                     # This file
│   ├── design.md                   # Implementation design
│   └── wip.md                      # Work in progress
│
└── package.json
```

---

## Testing Checklist

### Unit Tests
- [ ] ConversationService - create, add turns, get history
- [ ] MasterAgentTools - all tools return correct data
- [ ] MasterAgent - decision flow logic

### Integration Tests
- [ ] Daemon connects via WebSocket
- [ ] Spawn agent command flows to daemon
- [ ] Status updates flow back to server
- [ ] MongoDB persistence works

### End-to-End Tests
- [ ] Direct response query completes
- [ ] Clarifying question is asked
- [ ] Terminal agent spawns and completes
- [ ] Conversation history is maintained
- [ ] Dual output format is correct

---

## Commands Reference

```bash
# Start server
cd bun-agent
bun run dev:backend

# Start daemon (separate terminal)
GEMINI_API_KEY=your_key bun run daemon

# Test endpoints
curl http://localhost:3001/daemon-api/test/daemons

curl -X POST http://localhost:3001/daemon-api/test/spawn \
  -H "Content-Type: application/json" \
  -d '{"email": "you@email.com", "goal": "What is 2+2?"}'

curl http://localhost:3001/daemon-api/test/agent/AGENT_ID
```

---

## Known Limitations

1. **Single daemon per user** - Currently only supports one daemon per email
2. **No authentication** - Uses email header for identification (hackathon mode)
3. **Conversation timeout** - History cleared after 4 hours of inactivity
4. **PTY cleanup** - Sometimes processes hang after completion (needs force kill)