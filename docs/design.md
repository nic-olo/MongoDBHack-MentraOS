# Implementation Design

This document describes exactly what code changes are needed and where to make them.

## Implementation Order

1. MongoDB Connection
2. DaemonManager MongoDB Integration
3. Test Endpoint (verify daemon → server → MongoDB flow)
4. Move MasterAgent to Main Server
5. Add Terminal Sub-Agent
6. Update Routes (remove proxy)
7. Fix TerminalAgent Cleanup

---

## Step 1: MongoDB Connection

### Create: `src/server/db/mongo.ts`

```typescript
import { MongoClient, Db } from 'mongodb';

let client: MongoClient | null = null;
let db: Db | null = null;

export async function connectMongo(): Promise<Db> {
  if (db) return db;
  
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    throw new Error('MONGODB_URI environment variable not set');
  }
  
  client = new MongoClient(uri);
  await client.connect();
  db = client.db('mentraos');
  
  console.log('[MongoDB] Connected to database');
  return db;
}

export function getDb(): Db {
  if (!db) {
    throw new Error('MongoDB not connected. Call connectMongo() first.');
  }
  return db;
}

export async function closeMongo(): Promise<void> {
  if (client) {
    await client.close();
    client = null;
    db = null;
  }
}
```

### Modify: `src/server/index.ts`

Add at the top of the file after imports:
```typescript
import { connectMongo } from './db/mongo';
```

Add before `app.start()`:
```typescript
// Connect to MongoDB
await connectMongo();
```

---

## Step 2: DaemonManager MongoDB Integration

### Modify: `src/server/daemon/DaemonManager.ts`

Add import at top:
```typescript
import { getDb } from '../db/mongo';
import { ObjectId } from 'mongodb';
```

Modify `spawnAgent()` method - after creating agentState, add:
```typescript
// Persist to MongoDB
const db = getDb();
await db.collection('subagents').insertOne({
  ...agentState,
  _id: new ObjectId(),
  createdAt: new Date(),
  updatedAt: new Date(),
});
```

Modify `onAgentStatus()` method - add MongoDB update:
```typescript
// Persist to MongoDB
const db = getDb();
await db.collection('subagents').updateOne(
  { agentId },
  { 
    $set: { 
      status: payload.status,
      currentStep: payload.currentStep,
      updatedAt: new Date(),
    },
    $push: { notes: payload.currentStep }
  }
);
```

Modify `onAgentComplete()` method - add MongoDB update:
```typescript
// Persist to MongoDB
const db = getDb();
await db.collection('subagents').updateOne(
  { agentId },
  { 
    $set: { 
      status: payload.status,
      result: payload.result,
      error: payload.error,
      executionTimeMs: payload.executionTimeMs,
      completedAt: new Date(),
      updatedAt: new Date(),
    }
  }
);
```

Add new method to poll for completion:
```typescript
/**
 * Wait for an agent to complete (poll MongoDB)
 */
async waitForCompletion(agentId: string, timeoutMs: number = 300000): Promise<SubAgentState | null> {
  const db = getDb();
  const pollInterval = 1000; // 1 second
  const maxAttempts = timeoutMs / pollInterval;
  let attempts = 0;
  
  while (attempts < maxAttempts) {
    const doc = await db.collection('subagents').findOne({ agentId });
    
    if (!doc) return null;
    
    if (doc.status === 'completed' || doc.status === 'failed' || doc.status === 'cancelled') {
      return doc as unknown as SubAgentState;
    }
    
    await new Promise(resolve => setTimeout(resolve, pollInterval));
    attempts++;
  }
  
  return null; // Timeout
}
```

---

## Step 3: Test Endpoint

### Modify: `src/server/daemon/routes.ts`

Add test endpoint inside `createDaemonRoutes()`:
```typescript
/**
 * POST /test/spawn
 * Test endpoint to spawn an agent on a connected daemon
 * Body: { email: string, goal: string, workingDirectory?: string }
 */
router.post("/test/spawn", async (req: Request, res: Response) => {
  const { email, goal, workingDirectory } = req.body;
  
  if (!email || !goal) {
    return res.status(400).json({ error: "email and goal are required" });
  }
  
  // Find daemon for this user
  const daemon = daemonManager.getOnlineDaemonForUser(email);
  if (!daemon) {
    return res.status(404).json({ 
      error: "No online daemon found for this user",
      email 
    });
  }
  
  // Spawn agent
  const agentId = await daemonManager.spawnAgent(daemon.daemonId, {
    agentType: "terminal",
    goal,
    workingDirectory: workingDirectory || process.cwd(),
    sessionId: `test_${Date.now()}`,
  });
  
  if (!agentId) {
    return res.status(500).json({ error: "Failed to spawn agent" });
  }
  
  return res.json({ 
    success: true, 
    agentId,
    daemonId: daemon.daemonId,
    message: "Agent spawned. Poll /test/agent/:id for status."
  });
});

/**
 * GET /test/agent/:id
 * Get agent status from MongoDB
 */
router.get("/test/agent/:id", async (req: Request, res: Response) => {
  const { id } = req.params;
  
  const db = getDb();
  const agent = await db.collection('subagents').findOne({ agentId: id });
  
  if (!agent) {
    return res.status(404).json({ error: "Agent not found" });
  }
  
  return res.json(agent);
});
```

Add import at top of routes.ts:
```typescript
import { getDb } from '../db/mongo';
```

### Testing This Step

```bash
# Terminal 1: Start server
bun run dev

# Terminal 2: Start daemon
bun run daemon

# Terminal 3: Test spawn
curl -X POST http://localhost:3001/daemon-api/test/spawn \
  -H "Content-Type: application/json" \
  -d '{"email": "your@email.com", "goal": "List files in current directory"}'

# Poll for result
curl http://localhost:3001/daemon-api/test/agent/AGENT_ID_FROM_ABOVE
```

---

## Step 4: Move MasterAgent to Main Server

### Create directory: `src/server/master-agent/`

### Move files:
- `src/master-agent/src/master-agent.ts` → `src/server/master-agent/master-agent.ts`
- `src/master-agent/src/types.ts` → `src/server/master-agent/types.ts`
- `src/master-agent/src/sub-agents/` → `src/server/master-agent/sub-agents/`

### Modify: `src/server/master-agent/master-agent.ts`

Update imports to use relative paths:
```typescript
import type { AgentResult } from './types.js';
import { executeSubAgent, type AgentType, type AgentResponse } from './sub-agents/index.js';
```

Add DaemonManager dependency:
```typescript
import { getDaemonManager } from '../daemon/DaemonManager';
```

Modify constructor to accept userId:
```typescript
export class MasterAgent {
  private client: Anthropic;
  private model: string = 'claude-sonnet-4-20250514';
  private userId: string;

  constructor(apiKey: string, userId: string) {
    this.client = new Anthropic({ apiKey });
    this.userId = userId;
  }
```

---

## Step 5: Add Terminal Sub-Agent

### Create: `src/server/master-agent/sub-agents/terminal-agent.ts`

```typescript
import { getDaemonManager } from '../../daemon/DaemonManager';
import type { AgentRequest, AgentResponse } from './types';

export class TerminalSubAgent {
  private userId: string;
  
  constructor(userId: string) {
    this.userId = userId;
  }
  
  async execute(query: string, context: Record<string, any>): Promise<AgentResponse> {
    const startTime = Date.now();
    const daemonManager = getDaemonManager();
    
    // Find user's daemon
    const daemon = daemonManager.getOnlineDaemonForUser(this.userId);
    if (!daemon) {
      return {
        agent_id: `terminal_${Date.now()}`,
        agent_type: 'terminal',
        status: 'failed',
        findings: '',
        error: `No online daemon found for user ${this.userId}`,
        execution_time_ms: Date.now() - startTime,
      };
    }
    
    // Spawn agent on daemon
    const agentId = await daemonManager.spawnAgent(daemon.daemonId, {
      agentType: 'terminal',
      goal: query,
      workingDirectory: context.workingDirectory || process.cwd(),
      sessionId: context.sessionId,
    });
    
    if (!agentId) {
      return {
        agent_id: `terminal_${Date.now()}`,
        agent_type: 'terminal',
        status: 'failed',
        findings: '',
        error: 'Failed to spawn agent on daemon',
        execution_time_ms: Date.now() - startTime,
      };
    }
    
    // Wait for completion (polls MongoDB)
    const result = await daemonManager.waitForCompletion(agentId, 5 * 60 * 1000);
    
    if (!result) {
      return {
        agent_id: agentId,
        agent_type: 'terminal',
        status: 'failed',
        findings: '',
        error: 'Agent timed out',
        execution_time_ms: Date.now() - startTime,
      };
    }
    
    return {
      agent_id: agentId,
      agent_type: 'terminal',
      status: result.status === 'completed' ? 'completed' : 'failed',
      findings: result.result || '',
      error: result.error,
      execution_time_ms: result.executionTimeMs || (Date.now() - startTime),
    };
  }
}
```

### Modify: `src/server/master-agent/sub-agents/index.ts`

Add terminal agent to registry:
```typescript
import { TerminalSubAgent } from './terminal-agent';

// In executeSubAgent function:
if (request.agent_type === 'terminal') {
  const agent = new TerminalSubAgent(request.context?.userId);
  return await agent.execute(request.query, request.context || {});
}
```

### Modify: `src/server/master-agent/master-agent.ts`

Update the prompt in `decideAgents()` to include terminal:
```typescript
Available Sub-Agents:
- scout: Finds files, maps dependencies, analyzes codebase structure
- analyzer: Deep code understanding, architecture analysis, pattern detection
- implementer: Writes/modifies code based on specifications
- tester: Runs tests and validates changes
- terminal: Runs Claude Code CLI on user's machine for complex coding tasks
```

Pass userId to sub-agents in `executeAgents()`:
```typescript
context.userId = this.userId;
context.sessionId = `session_${Date.now()}`;
```

---

## Step 6: Update Routes (Remove Proxy)

### Modify: `src/server/routes/routes.ts`

Remove the proxy code and call MasterAgent directly.

Replace the `/api/master-agent/query` handler:
```typescript
import { MasterAgent } from '../master-agent/master-agent';
import { getDb } from '../db/mongo';

// Cache of MasterAgent instances per user (optional, can create new each time)
const masterAgents = new Map<string, MasterAgent>();

function getMasterAgent(userId: string): MasterAgent {
  let agent = masterAgents.get(userId);
  if (!agent) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) throw new Error('ANTHROPIC_API_KEY not set');
    agent = new MasterAgent(apiKey, userId);
    masterAgents.set(userId, agent);
  }
  return agent;
}

app.post('/api/master-agent/query', async (req: any, res: any) => {
  try {
    const { userId, query } = req.body;
    
    // Validation (keep existing)...
    
    const taskId = `task_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    
    // Store task in MongoDB
    const db = getDb();
    await db.collection('tasks').insertOne({
      taskId,
      userId,
      query,
      status: 'processing',
      createdAt: new Date(),
    });
    
    // Return immediately
    res.json({
      success: true,
      task_id: taskId,
      status: 'processing',
      message: 'Master Agent is processing your query',
      userId,
    });
    
    // Process in background
    const masterAgent = getMasterAgent(userId);
    try {
      const result = await masterAgent.processQuery(query);
      
      await db.collection('tasks').updateOne(
        { taskId },
        { 
          $set: { 
            status: 'completed',
            result,
            completedAt: new Date(),
          }
        }
      );
    } catch (error) {
      await db.collection('tasks').updateOne(
        { taskId },
        { 
          $set: { 
            status: 'failed',
            error: error instanceof Error ? error.message : String(error),
            completedAt: new Date(),
          }
        }
      );
    }
  } catch (error) {
    // Error handling...
  }
});
```

Replace the `/api/master-agent/task/:taskId` handler:
```typescript
app.get('/api/master-agent/task/:taskId', async (req: any, res: any) => {
  try {
    const { taskId } = req.params;
    const userId = req.query.userId as string;
    
    const db = getDb();
    const task = await db.collection('tasks').findOne({ taskId });
    
    if (!task) {
      return res.status(404).json({
        error: 'Task not found',
        code: 'TASK_NOT_FOUND',
        task_id: taskId,
      });
    }
    
    // Map to expected format
    res.json({
      id: task.taskId,
      query: task.query,
      status: task.status,
      result: task.result,
      error: task.error,
      created_at: task.createdAt,
      completed_at: task.completedAt,
      userId: task.userId,
    });
  } catch (error) {
    // Error handling...
  }
});
```

---

## Step 7: Fix TerminalAgent Cleanup

### Modify: `daemon/src/terminal-agent.ts`

Update the `cleanup()` method:
```typescript
private cleanup(): void {
  this.isRunning = false;

  if (this.session?.proc) {
    // Send exit command
    try {
      this.write("exit\r");
    } catch {
      // Ignore errors during cleanup
    }

    // Force kill after 1 second if still running
    setTimeout(() => {
      try {
        if (this.session?.proc) {
          this.session.proc.kill();
        }
      } catch {
        // Ignore
      }
    }, 1000);
    
    // Close terminal after 2 seconds
    setTimeout(() => {
      try {
        this.session?.proc.terminal?.close();
      } catch {
        // Ignore
      }
      this.session = null;
    }, 2000);
  } else {
    this.session = null;
  }
}
```

---

## File Structure After Changes

```
src/server/
├── db/
│   └── mongo.ts                 # NEW: MongoDB connection
├── daemon/
│   ├── DaemonManager.ts         # MODIFIED: Add MongoDB persistence
│   ├── routes.ts                # MODIFIED: Add test endpoints
│   ├── types.ts
│   └── index.ts
├── master-agent/                # NEW: Moved from src/master-agent/src/
│   ├── master-agent.ts          # MODIFIED: Accept userId
│   ├── types.ts
│   └── sub-agents/
│       ├── index.ts             # MODIFIED: Add terminal agent
│       ├── scout-agent.ts
│       ├── analyzer-agent.ts
│       ├── implementer-agent.ts
│       ├── tester-agent.ts
│       └── terminal-agent.ts    # NEW: Terminal sub-agent
├── routes/
│   └── routes.ts                # MODIFIED: Direct MasterAgent calls
└── index.ts                     # MODIFIED: Connect MongoDB on startup

daemon/src/
└── terminal-agent.ts            # MODIFIED: Fix cleanup
```

---

## Verification Steps

After implementing all steps:

1. **Start MongoDB** (or use Atlas connection)

2. **Start server**: `bun run dev`
   - Should see: `[MongoDB] Connected to database`

3. **Start daemon**: `bun run daemon`
   - Should see: `🟢 Connected to server`

4. **Test spawn endpoint**:
   ```bash
   curl -X POST http://localhost:3001/daemon-api/test/spawn \
     -H "Content-Type: application/json" \
     -d '{"email": "your@email.com", "goal": "What is 2+2?"}'
   ```

5. **Check MongoDB**: Verify document created in `subagents` collection

6. **Poll for result**:
   ```bash
   curl http://localhost:3001/daemon-api/test/agent/AGENT_ID
   ```

7. **Test full flow via frontend**:
   - Open webview
   - Submit a query
   - Should complete without needing separate Master Agent server

---

## Rollback Plan

If something breaks:

1. Keep `src/master-agent/` intact (don't delete after copying)
2. Routes can be reverted to proxy mode by changing back to `fetch(MASTER_AGENT_URL/...)`
3. DaemonManager still works without MongoDB (in-memory fallback)