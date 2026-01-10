# MentraOS Desktop Daemon & Sub-Agent System

## Project Overview

This project enables AI coding agents to run on a user's desktop machine, orchestrated by a cloud-based Master Agent. The system is part of a MentraOS hackathon project that allows users to interact with AI through AR glasses.

### The Problem

When a user speaks a command like "fix the bug in auth.ts", the Master Agent needs to:
1. Understand the request
2. Run Claude Code CLI on the user's actual machine (where their code lives)
3. Report results back to the user

The Master Agent runs in the cloud, but Claude Code CLI needs to run locally on the user's machine with access to their filesystem, git, environment, etc.

### The Solution

A **Desktop Daemon** runs on the user's machine and connects to the cloud server. The Master Agent can spawn "terminal sub-agents" that execute on the daemon, running Claude Code CLI in a real terminal (PTY).

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         MentraOS Server (Cloud)                              │
│                                                                              │
│  ┌──────────────┐     ┌──────────────────┐     ┌────────────────────────┐   │
│  │  Frontend    │     │   MasterAgent    │     │    DaemonManager       │   │
│  │  (React)     │────▶│   (per user)     │────▶│    (singleton)         │   │
│  │              │     │                  │     │                        │   │
│  │ POST /api/   │     │ - processQuery() │     │ - WebSocket to daemons │   │
│  │ master-agent │     │ - decideAgents() │     │ - spawnAgent()         │   │
│  │ /query       │     │ - executeAgents()│     │ - onAgentStatus()      │   │
│  └──────────────┘     └──────────────────┘     └────────────────────────┘   │
│         │                      │                         │                   │
│         │                      │                         │ WebSocket         │
│         ▼                      ▼                         ▼                   │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                         MongoDB                                      │    │
│  │  - tasks: Master Agent task state                                   │    │
│  │  - subagents: Terminal agent state (status, result, etc.)           │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    │ WebSocket: commands (spawn_agent, kill_agent)
                                    │ REST: updates (status, complete, log)
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                      Desktop Daemon (User's Machine)                         │
│                                                                              │
│  ┌──────────────────┐     ┌──────────────┐     ┌────────────────────────┐   │
│  │   DaemonClient   │     │  AgentPool   │     │   TerminalAgent        │   │
│  │                  │     │              │     │                        │   │
│  │ - WS connection  │────▶│ - spawn()    │────▶│ - PTY terminal         │   │
│  │ - REST updates   │     │ - kill()     │     │ - Claude CLI           │   │
│  │ - heartbeat      │     │ - events     │     │ - LLM Observer         │   │
│  └──────────────────┘     └──────────────┘     └────────────────────────┘   │
│                                                          │                   │
│                                                          ▼                   │
│                                                 ┌────────────────────────┐   │
│                                                 │   LLM Observer         │   │
│                                                 │   (Gemini Flash)       │   │
│                                                 │                        │   │
│                                                 │ Watches terminal and   │   │
│                                                 │ detects: ready,        │   │
│                                                 │ working, completed,    │   │
│                                                 │ needs_approval, error  │   │
│                                                 └────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Key Components

### 1. Desktop Daemon (`daemon/`)

Runs on user's machine. Started with `bun run daemon`.

**Files:**
- `src/index.ts` - Entry point, CLI commands (auth, status, reset, test)
- `src/daemon-client.ts` - WebSocket + REST client to cloud
- `src/agent-pool.ts` - Manages multiple concurrent agents
- `src/terminal-agent.ts` - Spawns Claude CLI in PTY, monitors with LLM
- `src/observer.ts` - Uses Gemini Flash to detect terminal state
- `src/config.ts` - Stores config in `~/.desktop-daemon/config.json`

**How it works:**
1. User runs `bun run daemon`, enters email
2. Daemon connects to server via WebSocket at `/ws/daemon?email=...`
3. Server sends `spawn_agent` command via WebSocket
4. Daemon creates TerminalAgent, runs Claude CLI
5. Daemon sends status updates via REST to `/daemon-api/subagent/:id/status`
6. When complete, sends result via REST to `/daemon-api/subagent/:id/complete`

### 2. DaemonManager (`src/server/daemon/`)

Cloud-side singleton that manages daemon connections.

**Files:**
- `DaemonManager.ts` - Main class, handles WS connections, tracks state
- `routes.ts` - REST endpoints for daemon updates
- `types.ts` - Shared type definitions

**Key methods:**
- `handleWebSocket(ws, daemonId, userId)` - Accept daemon connection
- `spawnAgent(daemonId, options)` - Send spawn command via WS
- `killAgent(agentId)` - Send kill command via WS
- `onAgentStatus(agentId, payload)` - Receive status update
- `onAgentComplete(agentId, payload)` - Receive completion
- `getOnlineDaemonForUser(userId)` - Find daemon by email

**Events emitted:**
- `daemon:connected`, `daemon:disconnected`
- `agent:started`, `agent:status`, `agent:completed`, `agent:failed`, `agent:log`

### 3. Master Agent (`src/master-agent/`)

Orchestrates sub-agents to accomplish complex tasks.

**Current state:** Runs as separate server on port 3001, uses HTTP proxy.

**How it works:**
1. Receives query like "fix the auth bug"
2. `decideAgents()` - Uses Claude to plan which sub-agents to deploy
3. `executeAgents()` - Runs sub-agents in parallel/sequence based on dependencies
4. `synthesize()` - Combines results into final response

**Current sub-agents (mock):**
- `scout` - Find files, map dependencies
- `analyzer` - Deep code understanding
- `implementer` - Write/modify code
- `tester` - Run tests

**Missing:** `terminal` sub-agent that uses DaemonManager to run on user's machine.

### 4. Frontend API (`src/server/routes/routes.ts`)

REST endpoints the frontend calls:

- `POST /api/master-agent/query` - Submit query, returns task_id
- `GET /api/master-agent/task/:taskId` - Poll for result

Currently proxies to separate Master Agent server. Need to integrate directly.

### 5. LLM Observer (`daemon/src/observer.ts`)

Uses Gemini Flash (fast, cheap) to intelligently detect terminal state.

**Why:** Claude CLI output is messy (ANSI codes, various prompt styles). Instead of brittle regex, we use AI to understand what's happening.

**States detected:**
- `initializing` - Claude CLI starting up
- `ready` - Waiting for input (prompt visible)
- `working` - Actively processing
- `needs_approval` - Asking permission (y/n)
- `completed` - Task done, back to prompt
- `error` - Something went wrong

**Actions returned:**
- `wait` - Keep monitoring
- `send_approval` - Send "y" to approve
- `report_complete` - Task is done
- `report_error` - Task failed

---

## Current State (What's Working)

### ✅ Fully Working

1. **Daemon connects to server**
   - WebSocket connection at `/ws/daemon?email=...`
   - Server logs: `[Daemon WS] New connection from: email@example.com`

2. **TerminalAgent runs Claude CLI**
   - Tested with `bun run daemon test "What is 2+2?"`
   - Spawns PTY terminal, launches `claude` command
   - Submits goal, monitors output

3. **LLM Observer detects states**
   - Correctly identifies `working` → `completed` transitions
   - High confidence (0.9) on state detection

4. **Daemon has REST client methods**
   - `sendHeartbeat()`, `sendStatusUpdate()`, `sendComplete()`, `sendLog()`
   - Sends to `/daemon-api/*` endpoints

5. **Server has REST endpoints**
   - `/daemon-api/daemon/heartbeat`
   - `/daemon-api/subagent/:id/status`
   - `/daemon-api/subagent/:id/complete`
   - `/daemon-api/subagent/:id/log`

6. **DaemonManager emits events**
   - `agent:status`, `agent:completed`, `agent:failed`, etc.
   - Can be subscribed to with `daemonManager.subscribe(callback)`

### ⚠️ Partially Working

1. **Heartbeat REST calls**
   - Fixed auth (uses `X-Daemon-Email` header)
   - Need to verify it works end-to-end

2. **Cleanup after task completion**
   - Sometimes process hangs after completion
   - Need to force-kill PTY

### ❌ Not Working / Not Implemented

1. **MongoDB integration**
   - DaemonManager stores state in-memory only
   - Need to persist to MongoDB

2. **Master Agent integration**
   - Still runs as separate server
   - Need to move into main server
   - Need to add `terminal` sub-agent type

3. **Spawning agents from server**
   - Have the code but never tested end-to-end
   - Need test endpoint to trigger spawn

4. **MasterAgent → DaemonManager flow**
   - MasterAgent doesn't know about DaemonManager
   - Need to connect them

---

## Desired State (End Goal)

### User Flow

1. User wears MentraOS glasses, says "Hey SOGA, fix the authentication bug"
2. Voice transcription captures command
3. MasterAgent receives query, decides: "I need terminal agent to analyze and fix code"
4. MasterAgent calls `daemonManager.spawnAgent(userId, {goal: "...", ...})`
5. DaemonManager sends command to user's daemon via WebSocket
6. Daemon's TerminalAgent runs Claude CLI, executes the fix
7. Daemon sends status updates → Server → MongoDB
8. MasterAgent polls/subscribes to MongoDB, sees completion
9. MasterAgent synthesizes result, speaks to user via glasses

### Technical Requirements

1. **Single server** - No separate Master Agent server
2. **MongoDB persistence** - Tasks and subagent state
3. **Frontend unchanged** - Same `/api/master-agent/*` endpoints
4. **Real-time updates** - Status flows from daemon to server to frontend

---

## MongoDB Schema

**Connection string:** Set via `MONGODB_URI` environment variable.

### Collection: `subagents`

```javascript
{
  _id: ObjectId,
  agentId: "agent_1234567890_abc123",
  
  // Ownership
  daemonId: "daemon_user@example.com",
  userId: "user@example.com",
  sessionId: "session_xyz",  // MasterAgent session
  
  // Agent info
  type: "terminal",
  goal: "List files and describe what you see",
  workingDirectory: "/Users/example/project",
  
  // Status
  status: "pending" | "initializing" | "running" | "completed" | "failed" | "cancelled",
  currentStep: "Claude is analyzing the codebase...",
  notes: ["Started Claude CLI", "Goal submitted", "Working..."],
  
  // Result
  result: "Found 15 files...",  // Final output
  error: null,                   // Error message if failed
  executionTimeMs: 45000,
  
  // Timestamps
  createdAt: ISODate, 
  startedAt: ISODate,
  updatedAt: ISODate,
  completedAt: ISODate
}
```

### Collection: `tasks`

```javascript
{
  _id: ObjectId,
  taskId: "task_1234567890_abc123",
  
  userId: "user@example.com",
  query: "Fix the authentication bug",
  
  status: "processing" | "completed" | "failed",
  
  // MasterAgent output
  agentsPlan: [...],      // Which sub-agents were planned
  agentResults: {...},    // Results from each sub-agent
  synthesis: "...",       // Final synthesized response (markdown)
  
  createdAt: ISODate,
  completedAt: ISODate
}
```

---

## API Endpoints

### Frontend → Server (unchanged)

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/master-agent/query` | Submit query, returns task_id |
| GET | `/api/master-agent/task/:taskId` | Get task status/result |
| GET | `/api/master-agent/health` | Health check |

### Daemon → Server

| Method | Path | Description |
|--------|------|-------------|
| POST | `/daemon-api/daemon/heartbeat` | Periodic health check |
| POST | `/daemon-api/subagent/:id/status` | Status update |
| POST | `/daemon-api/subagent/:id/complete` | Task completion |
| POST | `/daemon-api/subagent/:id/log` | Log streaming |
| GET | `/daemon-api/daemon/status` | Get daemon's own status |

### WebSocket

| Path | Direction | Description |
|------|-----------|-------------|
| `/ws/daemon?email=...` | Server ← Daemon | Daemon connects |
| `spawn_agent` | Server → Daemon | Create new agent |
| `kill_agent` | Server → Daemon | Stop agent |
| `ping/pong` | Bidirectional | Connection health |

---

## Environment Variables

```bash
# MongoDB
MONGODB_URI=               # MongoDB connection string

# API Keys
ANTHROPIC_API_KEY=         # For MasterAgent (Claude)
GEMINI_API_KEY=            # For LLM Observer (Gemini Flash)

# Server
PORT=3001
DAEMON_SERVER_URL=http://localhost:3001  # For daemon to connect

# MentraOS (existing)
PACKAGE_NAME=com.mentra.soga
MENTRAOS_API_KEY=          # MentraOS API key
```

---

## Files to Modify

### High Priority

| File | Change |
|------|--------|
| `src/server/daemon/DaemonManager.ts` | Add MongoDB persistence |
| `src/server/index.ts` | Create MasterAgent per session, remove proxy |
| `src/server/routes/routes.ts` | Direct MasterAgent calls instead of proxy |
| `src/master-agent/src/sub-agents/` | Add `terminal` agent type |
| `daemon/src/terminal-agent.ts` | Fix cleanup/exit hanging |

### Move/Refactor

| From | To | Notes |
|------|-----|-------|
| `src/master-agent/src/master-agent.ts` | `src/server/master-agent/` | Move into main server |
| `src/master-agent/src/sub-agents/` | `src/server/master-agent/sub-agents/` | Move with it |

---

## Testing Checklist

### Unit Tests (Isolated)

- [x] `bun run daemon test "..."` - TerminalAgent works locally
- [ ] Observer correctly detects all states
- [ ] REST client sends correct payloads

### Integration Tests

- [ ] Daemon connects, heartbeat succeeds (no 401)
- [ ] Server can spawn agent via WebSocket
- [ ] Daemon status updates reach server
- [ ] Server persists updates to MongoDB
- [ ] MasterAgent can read subagent results from MongoDB

### End-to-End Tests

- [ ] Frontend submits query → MasterAgent → Daemon → Result
- [ ] Voice command → Full flow → Spoken response

---

## Commands Reference

```bash
# Start the server
bun run dev

# Start daemon (first time - asks for email)
bun run daemon

# Daemon commands
bun run daemon status   # Check config
bun run daemon reset    # Clear config
bun run daemon test "your goal here"  # Test locally without server

# Test daemon (with server running)
# 1. Start server: bun run dev
# 2. In another terminal: bun run daemon
# 3. Trigger spawn from server (need test endpoint)
```

---

## Known Issues

1. **Process hangs after completion** - TerminalAgent cleanup needs force kill
2. **No test endpoint** - Can't easily trigger spawn from server
3. **In-memory only** - Lose state on server restart
4. **Separate Master Agent server** - Need to consolidate
