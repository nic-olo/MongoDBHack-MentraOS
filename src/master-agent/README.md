# Master Agent - TypeScript Version

AI orchestrator that analyzes queries, decides which sub-agents to deploy, coordinates execution, monitors behavior, and synthesizes results.

## Architecture

```
User Query
    ↓
📊 Analysis: Master Agent uses Claude to understand task
    ↓
🧠 Decision: Determines which SUB-AGENTS to spawn (strategic thinking)
    ↓
⚡ Execution: Spawns agents, monitors progress, kills if off-track
    ↓
🔬 Synthesis: Combines findings into actionable answer
    ↓
📡 Updates: Pushes real-time updates to user
```

## Key Features

### 🚀 **Agent Spawn/Kill/Monitor System**
- **Spawn agents** dynamically based on task requirements
- **Monitor progress** via real-time updates from sub-agents
- **Auto-kill agents** that deviate >75% from mission objectives
- **Manual termination** for manual intervention
- **Real-time SSE stream** for live updates to frontend

### 🤖 **Sub-Agent Types**
- **Scout**: Finds files, maps dependencies, analyzes codebase structure
- **Analyzer**: Deep code understanding, architecture analysis, pattern detection
- **Implementer**: Writes/modifies code based on specifications
- **Tester**: Runs tests and validates changes

## Quick Start

### 1. Install Dependencies

```bash
cd src/master-agent
npm install
```

### 2. Setup Environment

```bash
# Copy template
cp .env.example .env

# Edit .env and add your Anthropic API key
# ANTHROPIC_API_KEY=sk-ant-your-key-here
```

### 3. Start API Server

```bash
# Start the Master Agent API server
npm start

# Or in development mode
npm run dev
```

The server will start on `http://localhost:3001`

### 4. Test the API

```bash
# Run the agent control test suite
./test-agent-control.sh
```

## What You'll See

```
🤖 MASTER AGENT POC - TypeScript Version

============================================================
🎯 MASTER AGENT: Processing query
============================================================
Query: Add category filtering to the notification system

📊 Phase 1: Analyzing query and selecting tools...

  🧠 Master Agent's Tool Plan:
     1. file_search({"query":"notification filter"})
     2. code_analyze({"files":["NotificationFilter.tsx"]})

  ✓ Selected 2 tools

⚡ Phase 2: Executing tools...
  🔧 Executing tool 1/2: file_search...
     ✓ file_search completed
  🔧 Executing tool 2/2: code_analyze...
     ✓ code_analyze completed
  ✓ All tools completed

🔬 Phase 3: Synthesizing results...
  ✓ Synthesis complete

============================================================
📋 FINAL RESULT
============================================================

Tools Used: file_search, code_analyze

💡 SYNTHESIS:
[Claude's detailed analysis and recommendations]
```

## API Endpoints

### Master Agent Orchestration

#### `POST /agent/query`
Submit a query to the Master Agent for autonomous processing.

```bash
curl -X POST http://localhost:3001/agent/query \
  -H "Content-Type: application/json" \
  -d '{"query": "Add category filtering to notifications"}'
```

#### `GET /agent/task/:taskId`
Get status and results of a task.

#### `GET /agent/tasks`
List all tasks.

### Agent Spawn/Kill/Monitor

#### `POST /agent/spawn`
Spawn a new sub-agent.

```bash
curl -X POST http://localhost:3001/agent/spawn \
  -H "Content-Type: application/json" \
  -d '{
    "agent_type": "scout",
    "query": "Find all authentication related files"
  }'
```

**Response:**
```json
{
  "agent_id": "scout-1234567890-abc123",
  "agent_type": "scout",
  "status": "spawning"
}
```

#### `POST /agent/:agentId/update`
Receive status update from a sub-agent. (Called BY sub-agents)

```bash
curl -X POST http://localhost:3001/agent/scout-123/update \
  -H "Content-Type: application/json" \
  -d '{
    "type": "progress",
    "message": "Scanning directory structure",
    "data": {"progress": 50},
    "deviation_score": 15
  }'
```

**Update Types:**
- `progress` - Progress update with completion percentage
- `finding` - Important discovery or insight
- `warning` - Potential issue or concern
- `error` - Error encountered

**Deviation Score:** 0-100 scale indicating how far agent is from original mission
- `0-25`: On track
- `25-50`: Slightly deviating
- `50-75`: Concerning deviation
- `>75`: **AUTO-KILL TRIGGERED** 💀

#### `POST /agent/:agentId/kill`
Manually terminate an agent.

```bash
curl -X POST http://localhost:3001/agent/scout-123/kill \
  -H "Content-Type: application/json" \
  -d '{"reason": "Going off-track"}'
```

#### `POST /agent/:agentId/complete`
Mark agent as successfully completed.

```bash
curl -X POST http://localhost:3001/agent/scout-123/complete \
  -H "Content-Type: application/json" \
  -d '{"findings": "Found 5 authentication files in src/auth/"}'
```

#### `GET /agent/:agentId/status`
Get detailed status of a specific agent.

#### `GET /agent/active`
Get all currently active agents (spawning or running).

#### `GET /agent/all`
Get all agents including completed and killed.

#### `GET /agent/updates/stream`
**Server-Sent Events (SSE)** stream for real-time user updates.

```javascript
// Frontend example
const eventSource = new EventSource('http://localhost:3001/agent/updates/stream');

eventSource.onmessage = (event) => {
  const update = JSON.parse(event.data);
  console.log(`[${update.agent_type}] ${update.message}`);
};
```

### System

#### `GET /health`
Health check endpoint.

#### `GET /`
API documentation and examples.

## Agent Decision Logic

### When to Kill an Agent? 🎯

The AgentManager automatically kills agents that:

1. **High Deviation** (>75%): Agent is going off-road from original mission
2. **Critical Errors**: Agent encounters unrecoverable errors
3. **Stuck/Frozen**: No updates received for >30 seconds
4. **Manual Kill**: Operator manually terminates

### When to Notify User? 📡

The system pushes updates to users when:

1. **Warnings or Errors**: Always notify immediately
2. **High Importance Findings**: Critical discoveries
3. **Progress Milestones**: Every 25% completion
4. **Throttled Updates**: Max one update every 5 seconds

### Agent Lifecycle

```
SPAWNING → RUNNING → {COMPLETED | KILLED}
    ↓          ↓           ↓
  notify   monitor    final update
```

## Testing & Simulation

### Run Test Suite

```bash
# Run comprehensive endpoint tests
./test-agent-control.sh
```

This will:
- Spawn multiple agents
- Send various update types
- Test auto-kill on high deviation
- Test manual kill
- Monitor agent lifecycle
- Test SSE stream

### Run Mock Agent Simulator

```bash
# Run agent behavior simulator
npm run simulate
```

The simulator spawns agents with different behaviors:
- **Normal**: Progresses smoothly to completion
- **High Deviation**: Goes off-track and gets auto-killed
- **Stuck**: Stops responding and gets killed after timeout
- **Error**: Encounters critical error

## Development

```bash
# Run in dev mode (with auto-reload)
npm run dev

# Build TypeScript
npm run build

# Run built version
npm start

# Run POC (simple test)
npm run poc
```

## Project Structure

```
src/master-agent/
├── src/
│   ├── master-agent.ts       # Core orchestrator logic
│   ├── poc-simple.ts          # Simple demo entry point
│   ├── types.ts               # TypeScript type definitions
│   └── tools/
│       └── mock-tools.ts      # Mock tool implementations
├── package.json
├── tsconfig.json
└── README.md
```

## How It Works

**The Core Intelligence**: Master Agent using Claude Sonnet 4 to:

1. **Analyze** your query deeply
2. **Decide** which tools to use (not hardcoded!)
3. **Execute** tools in the right order
4. **Synthesize** all findings into coherent answer

**No infrastructure** - pure orchestration logic.

## Integration with Main App

This can be integrated into the main application server:

```typescript
import { MasterAgent } from './master-agent/src/master-agent';

// In your API route
app.post('/api/agent/query', async (req, res) => {
  const agent = new MasterAgent(process.env.ANTHROPIC_API_KEY!);
  const result = await agent.processQuery(req.body.query);
  res.json(result);
});
```

## Complete Usage Examples

For detailed examples including:
- Full agent lifecycle workflows
- Real-time SSE integration
- React/TypeScript frontend examples
- Error handling scenarios
- Best practices

👉 **See [USAGE_EXAMPLES.md](USAGE_EXAMPLES.md)**

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────┐
│                     MASTER AGENT                        │
│  ┌────────────┐  ┌──────────────┐  ┌───────────────┐  │
│  │   Claude   │→ │ Agent Manager│→ │  Sub-Agents   │  │
│  │  Decision  │  │ (Spawn/Kill) │  │ Scout/Analyze │  │
│  └────────────┘  └──────────────┘  └───────────────┘  │
└─────────────────────────────────────────────────────────┘
         ↓                    ↓                    ↓
    [Analysis]          [Monitor]            [Execute]
         ↓                    ↓                    ↓
    Decision on         Track progress        Send updates
    which agents        Auto-kill if          Progress/findings
    to spawn           deviation >75%         Deviation score
         ↓                    ↓                    ↓
    ┌─────────────────────────────────────────────────────┐
    │              SSE STREAM (Real-time)                 │
    │  → Frontend receives live updates                   │
    │  → User sees agent progress                         │
    │  → Notifications on completion/kills                │
    └─────────────────────────────────────────────────────┘
```

## Key Decisions

### 🎯 Decision Matrix

| Event | Condition | Action |
|-------|-----------|--------|
| Agent Update | deviation_score > 75% | **AUTO-KILL** |
| Agent Update | No update for >30s | **AUTO-KILL** (stuck) |
| Agent Update | Critical error | **AUTO-KILL** |
| Agent Update | Warning/Error | **NOTIFY USER** immediately |
| Agent Update | High importance finding | **NOTIFY USER** immediately |
| Agent Update | Progress milestone (25%) | **NOTIFY USER** |
| Agent Update | Normal progress | **THROTTLE** (max 1/5s) |

## Real-World Use Cases

### 1. Codebase Analysis & Implementation
```
Query: "Add OAuth2 authentication to the API"
├─ Scout Agent: Find auth-related files
├─ Analyzer Agent: Analyze current auth patterns  
├─ Implementer Agent: Write OAuth2 integration
└─ Tester Agent: Run auth tests
```

### 2. Bug Investigation
```
Query: "Fix memory leak in the notification system"
├─ Scout Agent: Find notification system files
├─ Analyzer Agent: Analyze memory usage patterns
├─ Implementer Agent: Apply fixes
└─ Tester Agent: Verify memory usage is normal
```

### 3. Refactoring
```
Query: "Refactor authentication module to use TypeScript"
├─ Scout Agent: Map all auth files
├─ Analyzer Agent: Understand dependencies
├─ Implementer Agent: Convert to TypeScript
└─ Tester Agent: Ensure tests pass
```

## MongoDB Integration (Future)

The system is designed to integrate with MongoDB for:
- **Agent State Persistence**: Store agent lifecycle data
- **Update History**: Keep full audit trail of agent actions
- **Analytics**: Track agent performance and deviation patterns
- **Task Queue**: Distribute agent work across multiple servers

```typescript
// Future MongoDB schema
interface AgentDocument {
  agent_id: string;
  type: AgentType;
  query: string;
  status: string;
  updates: AgentUpdate[];
  spawned_at: Date;
  completed_at?: Date;
  killed_at?: Date;
  kill_reason?: string;
  metadata: {
    deviation_scores: number[];
    avg_deviation: number;
    total_updates: number;
    execution_time_ms: number;
  };
}
```

## Performance Considerations

- **SSE Connections**: Use connection pooling for multiple clients
- **Update Throttling**: Prevents overwhelming frontend with updates
- **Agent Cleanup**: Auto-cleanup terminated agents after 1 hour
- **Memory Management**: In-memory storage (use Redis/MongoDB for production)

## Security Considerations

- **API Authentication**: Add JWT/API key auth for production
- **Rate Limiting**: Prevent agent spawn abuse
- **Agent Sandboxing**: Limit agent capabilities and access
- **Update Validation**: Verify agent updates are authentic

## Next Steps

1. **✅ Agent Spawn/Kill System**: Complete
2. **✅ Real-time Monitoring**: Complete (SSE)
3. **✅ Decision Logic**: Complete (deviation/kill matrix)
4. **🚧 MongoDB Integration**: In progress
5. **📋 Dashboard UI**: Planned
6. **📋 Authentication**: Planned
7. **📋 Real Sub-Agents**: Planned (replace mocks)

## Contributing

Contributions welcome! Areas of focus:
- MongoDB integration
- Real sub-agent implementations
- Frontend dashboard
- Agent capability extensions
- Performance optimizations

## License

MIT
