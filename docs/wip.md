# Work In Progress - Implementation Status

## Current State (Updated after MasterAgent implementation)

### ✅ Phase 1: Infrastructure (COMPLETE)

| Component | Status | Notes |
|-----------|--------|-------|
| MongoDB Connection | ✅ Done | `src/server/db/mongo.ts` with indexes |
| DaemonManager | ✅ Done | WebSocket + REST, persists to MongoDB |
| Test Endpoints | ✅ Done | `/daemon-api/test/spawn`, `/test/agent/:id` |
| Desktop Daemon | ✅ Done | `daemon/src/` |
| TerminalAgent | ✅ Done | Claude CLI in PTY, improved cleanup |
| LLM Observer | ✅ Done | Gemini Flash for state detection |
| Daemon ↔ Server | ✅ Done | WebSocket commands, REST updates |

### ✅ Phase 2: MasterAgent Refactor (COMPLETE)

| Component | Status | Location |
|-----------|--------|----------|
| ConversationService | ✅ Done | `src/server/conversation/` |
| MasterAgent (new) | ✅ Done | `src/server/master-agent/` |
| MasterAgentTools | ✅ Done | Sandboxed tools for user data |
| Model Config | ✅ Done | Haiku 4.5 / Sonnet 4.5 |
| Updated Routes | ✅ Done | Direct calls, no proxy |

### 🔄 Phase 3: Cleanup & Testing (IN PROGRESS)

| Task | Status | Notes |
|------|--------|-------|
| Delete old `src/master-agent/` | ❌ TODO | Keep as reference for now |
| Test end-to-end flow | ❌ TODO | Need to run full test |
| Update frontend polling | ❌ TODO | Use new response format |
| Install dependencies | ✅ Done | `bun install` completed |

---

## What Was Implemented

### 1. ConversationService (`src/server/conversation/`)

- **ConversationService.ts** - Manages conversation history per user
  - `getOrCreateConversation(userId)` - Get active or create new conversation
  - `addTurn(conversationId, options)` - Add user/assistant turns
  - `getHistoryForPrompt(conversation)` - Format history for Claude
  - Auto-expires after 4 hours of inactivity
  - Keeps last 20 turns (MAX_TURNS)

- **types.ts** - Type definitions for conversations
  - `Conversation`, `ConversationTurn`, `AddTurnOptions`
  - Configuration constants

### 2. MasterAgent (`src/server/master-agent/`)

- **MasterAgent.ts** - Main orchestrator with:
  - Decision flow: `direct_response` / `clarifying_question` / `spawn_agent`
  - Tool use loop with Anthropic API
  - Dual output: `glassesDisplay` (short) + `webviewContent` (full)
  - Models: Haiku 4.5 (fast decisions), Sonnet 4.5 (synthesis)
  - Background processing (non-blocking)

- **MasterAgentTools.ts** - Sandboxed tools:
  - `get_recent_tasks` - User's recent tasks
  - `get_running_agents` - Active terminal agents
  - `get_agent_status` - Specific agent details
  - `get_daemon_status` - Is daemon online?
  - `get_conversation_summary` - Conversation context
  - All tools sandboxed by userId (security)

- **types.ts** - Type definitions:
  - `MasterAgentDecision`, `Task`, `TaskResult`
  - `MODELS` configuration
  - API types

### 3. Updated Routes (`src/server/routes/routes.ts`)

- **POST /api/master-agent/query**
  - Creates task in MongoDB
  - Returns taskId immediately (non-blocking)
  - Processes query in background with MasterAgent
  - Adds user message to conversation

- **GET /api/master-agent/task/:taskId**
  - Queries MongoDB directly (no proxy)
  - Returns task status and result
  - Includes dual output format

- **GET /api/master-agent/health**
  - Local health check (no external dependency)

### 4. Voice Helper Functions

- `callMasterAgentFromVoice()` - Now uses integrated MasterAgent
- `pollAndSpeakResult()` - Queries MongoDB directly, uses glassesDisplay

### 5. TerminalAgent Cleanup Fix

- Force kills PTY process after exit command
- Properly clears session references
- Prevents process hanging

---

## How to Run

### Terminal 1: Server
```bash
cd bun-agent
bun run dev:backend
```

### Terminal 2: Daemon
```bash
cd bun-agent
GEMINI_API_KEY=your_key bun run daemon
```

### Terminal 3: Test
```bash
# Check connected daemons
curl http://localhost:3001/daemon-api/test/daemons

# Spawn agent via test endpoint
curl -X POST http://localhost:3001/daemon-api/test/spawn \
  -H "Content-Type: application/json" \
  -d '{"email": "YOUR_EMAIL", "goal": "What is 2+2?"}'

# Poll for result
curl http://localhost:3001/daemon-api/test/agent/AGENT_ID

# Test new MasterAgent endpoint
curl -X POST http://localhost:3001/api/master-agent/query \
  -H "Content-Type: application/json" \
  -d '{"userId": "YOUR_EMAIL", "query": "What is TypeScript?"}'

# Poll task result
curl "http://localhost:3001/api/master-agent/task/TASK_ID?userId=YOUR_EMAIL"
```

---

## Key Files

| File | Purpose |
|------|---------|
| `src/server/db/mongo.ts` | MongoDB connection |
| `src/server/conversation/ConversationService.ts` | Conversation history |
| `src/server/master-agent/MasterAgent.ts` | Main orchestrator |
| `src/server/master-agent/MasterAgentTools.ts` | Sandboxed tools |
| `src/server/daemon/DaemonManager.ts` | Daemon + agent management |
| `src/server/routes/routes.ts` | API routes |
| `daemon/src/terminal-agent.ts` | Claude CLI in PTY |
| `daemon/src/observer.ts` | LLM observer (Gemini) |

---

## Environment Variables

```bash
# Server (.env)
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

## MongoDB Collections

| Collection | Purpose |
|------------|---------|
| `subagents` | Terminal agent state (agentId, status, result) |
| `tasks` | MasterAgent tasks (taskId, query, result) |
| `conversations` | Conversation history per user |

---

## Next Steps

1. [ ] Run full end-to-end test
2. [ ] Test conversation history persistence
3. [ ] Test tool use (get_recent_tasks, etc.)
4. [ ] Test dual output (glassesDisplay + webviewContent)
5. [ ] Test spawn_agent decision flow
6. [ ] Clean up old `src/master-agent/` directory
7. [ ] Update frontend to use new response format
8. [ ] Add error handling for edge cases

---

## Architecture Summary

```
User Query (Voice/Webview)
    │
    ▼
POST /api/master-agent/query
    │
    ├─► Create task in MongoDB
    ├─► Return taskId immediately
    │
    └─► Background: MasterAgent.processQuery()
            │
            ├─► Load conversation history
            ├─► Decide action (Haiku 4.5)
            │       │
            │       ├─► direct_response → Answer immediately
            │       ├─► clarifying_question → Ask for more info
            │       └─► spawn_agent → Terminal agent needed
            │
            ├─► If spawn_agent:
            │       ├─► Formulate goal (Sonnet 4.5)
            │       ├─► DaemonManager.spawnAgent()
            │       ├─► Wait for completion
            │       └─► Synthesize result (Sonnet 4.5)
            │
            ├─► Generate dual output:
            │       ├─► glassesDisplay (max 100 chars)
            │       └─► webviewContent (full markdown)
            │
            └─► Save to MongoDB + conversation
    
    ▼
GET /api/master-agent/task/:id (polling)
    │
    └─► { status, result: { glassesDisplay, webviewContent } }
```
