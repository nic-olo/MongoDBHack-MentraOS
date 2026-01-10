# Work In Progress - Current State

## What's Working NOW (Tested End-to-End)

1. **MongoDB Connection** - Connected to Atlas, indexes created
2. **DaemonManager persists to MongoDB** - Agent state saved/updated
3. **Daemon connects via WebSocket** - Using email for auth
4. **Test endpoint spawns agents** - `POST /daemon-api/test/spawn`
5. **TerminalAgent runs Claude CLI** - LLM observer detects states
6. **Status updates flow** - Daemon → Server → MongoDB

### Successful Test

```bash
# Spawn agent
curl -X POST http://localhost:3001/daemon-api/test/spawn \
  -H "Content-Type: application/json" \
  -d '{"email": "isaiahballah@gmail.com", "goal": "What is 2+2?"}'

# Poll status
curl http://localhost:3001/daemon-api/test/agent/AGENT_ID
```

Result: Completed in ~5 seconds, status persisted to MongoDB

---

## What's NOT Done Yet

### Step 4: Move MasterAgent to Main Server
- Move `src/master-agent/src/` → `src/server/master-agent/`
- Remove separate Express server
- Keep MasterAgent class and sub-agents

### Step 5: Add Terminal Sub-Agent
- Create `src/server/master-agent/sub-agents/terminal-agent.ts`
- Calls `daemonManager.spawnAgent()`
- Uses `daemonManager.waitForCompletion()` to poll

### Step 6: Update Routes (Remove Proxy)
- `POST /api/master-agent/query` should call MasterAgent directly
- Store tasks in MongoDB (not separate server memory)
- Remove `MASTER_AGENT_URL` proxy code

### Step 7: Fix TerminalAgent Cleanup
- Force kill PTY after completion
- Prevent process hanging

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
# Check daemons
curl http://localhost:3001/daemon-api/test/daemons

# Spawn agent
curl -X POST http://localhost:3001/daemon-api/test/spawn \
  -H "Content-Type: application/json" \
  -d '{"email": "YOUR_EMAIL", "goal": "YOUR_GOAL"}'

# Check status
curl http://localhost:3001/daemon-api/test/agent/AGENT_ID
```

---

## Key Files

| File | Purpose |
|------|---------|
| `src/server/db/mongo.ts` | MongoDB connection |
| `src/server/daemon/DaemonManager.ts` | Manages daemons, persists to MongoDB |
| `src/server/daemon/routes.ts` | REST endpoints including test endpoints |
| `daemon/src/index.ts` | Desktop daemon entry point |
| `daemon/src/terminal-agent.ts` | Runs Claude CLI in PTY |
| `daemon/src/observer.ts` | LLM observer (Gemini Flash) |

---

## Environment Variables Required

```bash
# .env file
PORT=3001
MONGODB_URI=mongodb+srv://...  # URL encode @ as %40 in password
ANTHROPIC_API_KEY=sk-ant-...
GEMINI_API_KEY=AIza...         # For daemon's LLM observer
PACKAGE_NAME=com.mentra.soga
MENTRAOS_API_KEY=...
```

---

## MongoDB Collections

- `subagents` - Terminal agent state (agentId, status, result, etc.)
- `tasks` - Master agent tasks (to be implemented)

---

## Git Branch

Working on `integration` branch. Commit current state before continuing.