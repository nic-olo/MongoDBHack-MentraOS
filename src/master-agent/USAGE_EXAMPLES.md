# Master Agent Usage Examples

## Table of Contents
1. [Basic Agent Spawning](#basic-agent-spawning)
2. [Agent Progress Monitoring](#agent-progress-monitoring)
3. [Auto-Kill on High Deviation](#auto-kill-on-high-deviation)
4. [Real-time Updates (SSE)](#real-time-updates-sse)
5. [Complete Workflow Example](#complete-workflow-example)

---

## Basic Agent Spawning

### Spawn a Scout Agent

```bash
curl -X POST http://localhost:3001/agent/spawn \
  -H "Content-Type: application/json" \
  -d '{
    "agent_type": "scout",
    "query": "Find all authentication related files in the codebase"
  }'
```

**Response:**
```json
{
  "agent_id": "scout-1736438400000-xyz789",
  "agent_type": "scout",
  "status": "spawning",
  "message": "Agent scout-1736438400000-xyz789 spawned successfully"
}
```

### Spawn Multiple Agent Types

```bash
# Scout
curl -X POST http://localhost:3001/agent/spawn \
  -d '{"agent_type": "scout", "query": "Map authentication flow"}'

# Analyzer
curl -X POST http://localhost:3001/agent/spawn \
  -d '{"agent_type": "analyzer", "query": "Analyze auth security patterns"}'

# Implementer
curl -X POST http://localhost:3001/agent/spawn \
  -d '{"agent_type": "implementer", "query": "Add 2FA support"}'

# Tester
curl -X POST http://localhost:3001/agent/spawn \
  -d '{"agent_type": "tester", "query": "Test authentication flows"}'
```

---

## Agent Progress Monitoring

### Send Progress Updates

Agents report their progress back to the master:

```bash
# Initial progress
curl -X POST http://localhost:3001/agent/scout-123/update \
  -H "Content-Type: application/json" \
  -d '{
    "type": "progress",
    "message": "Initializing codebase scan",
    "data": {"progress": 0},
    "deviation_score": 5
  }'

# Mid-progress
curl -X POST http://localhost:3001/agent/scout-123/update \
  -H "Content-Type: application/json" \
  -d '{
    "type": "progress",
    "message": "Scanning authentication modules",
    "data": {
      "progress": 50,
      "files_scanned": 150,
      "auth_files_found": 5
    },
    "deviation_score": 15
  }'

# Finding
curl -X POST http://localhost:3001/agent/scout-123/update \
  -H "Content-Type: application/json" \
  -d '{
    "type": "finding",
    "message": "Discovered critical authentication flow in AuthService",
    "data": {
      "importance": "high",
      "files": ["src/auth/AuthService.ts", "src/auth/TokenManager.ts"]
    },
    "deviation_score": 10
  }'
```

### Check Agent Status

```bash
curl http://localhost:3001/agent/scout-123/status | jq '.'
```

**Response:**
```json
{
  "id": "scout-123",
  "type": "scout",
  "query": "Find all authentication related files",
  "status": "running",
  "progress": 50,
  "spawned_at": "2026-01-10T12:00:00.000Z",
  "last_update": "2026-01-10T12:02:30.000Z",
  "updates": [
    {
      "timestamp": "2026-01-10T12:00:15.000Z",
      "type": "progress",
      "message": "Initializing codebase scan",
      "data": {"progress": 0},
      "deviation_score": 5
    },
    {
      "timestamp": "2026-01-10T12:02:30.000Z",
      "type": "progress",
      "message": "Scanning authentication modules",
      "data": {"progress": 50},
      "deviation_score": 15
    }
  ]
}
```

---

## Auto-Kill on High Deviation

### Scenario: Agent Goes Off-Road

```bash
# Agent starts well
curl -X POST http://localhost:3001/agent/analyzer-456/update \
  -d '{
    "type": "progress",
    "message": "Analyzing auth patterns",
    "data": {"progress": 20},
    "deviation_score": 10
  }'

# Agent starts deviating
curl -X POST http://localhost:3001/agent/analyzer-456/update \
  -d '{
    "type": "progress",
    "message": "Exploring database layer",
    "data": {"progress": 40},
    "deviation_score": 55
  }'

# High deviation - WARNING
curl -X POST http://localhost:3001/agent/analyzer-456/update \
  -d '{
    "type": "warning",
    "message": "Investigating unrelated UI components",
    "data": {"progress": 50},
    "deviation_score": 85
  }'
```

**Result:** Agent automatically killed! Deviation score of 85% exceeds the 75% threshold.

**Server Logs:**
```
🎯 KILL DECISION: Deviation 85% > threshold 75%
💀 KILL: Agent analyzer-456 - Reason: Agent went off-road (deviation: 85%)
```

**User receives SSE update:**
```json
{
  "timestamp": "2026-01-10T12:05:00.000Z",
  "agent_id": "analyzer-456",
  "agent_type": "analyzer",
  "message": "Terminated analyzer agent: Agent went off-road (deviation: 85%)",
  "status": "killed",
  "data": {
    "reason": "Agent went off-road (deviation: 85%)"
  }
}
```

---

## Real-time Updates (SSE)

### Frontend Example (JavaScript)

```javascript
// Connect to SSE stream
const eventSource = new EventSource('http://localhost:3001/agent/updates/stream');

eventSource.onopen = () => {
  console.log('📡 Connected to agent updates stream');
};

eventSource.onmessage = (event) => {
  const update = JSON.parse(event.data);
  
  // Handle different update types
  switch (update.status) {
    case 'spawning':
      console.log(`🚀 [${update.agent_type}] Spawned: ${update.message}`);
      break;
    
    case 'running':
      console.log(`⚡ [${update.agent_type}] Running: ${update.message}`);
      break;
    
    case 'completed':
      console.log(`✅ [${update.agent_type}] Completed: ${update.message}`);
      displayAgentResult(update);
      break;
    
    case 'killed':
      console.log(`💀 [${update.agent_type}] Killed: ${update.message}`);
      showWarning(`Agent terminated: ${update.data.reason}`);
      break;
  }
  
  // Update UI
  updateAgentStatusInUI(update);
};

eventSource.onerror = (error) => {
  console.error('❌ SSE connection error:', error);
};

// Helper functions
function updateAgentStatusInUI(update) {
  const agentCard = document.getElementById(`agent-${update.agent_id}`);
  if (agentCard) {
    agentCard.querySelector('.status').textContent = update.status;
    agentCard.querySelector('.message').textContent = update.message;
    
    // Show progress if available
    if (update.data?.progress) {
      agentCard.querySelector('.progress-bar').style.width = 
        `${update.data.progress}%`;
    }
  }
}

function displayAgentResult(update) {
  const resultsDiv = document.getElementById('agent-results');
  resultsDiv.innerHTML += `
    <div class="agent-result">
      <h4>${update.agent_type} Agent</h4>
      <p>${update.data.findings}</p>
      <small>Completed at ${new Date(update.timestamp).toLocaleTimeString()}</small>
    </div>
  `;
}

function showWarning(message) {
  const warningDiv = document.createElement('div');
  warningDiv.className = 'warning';
  warningDiv.textContent = message;
  document.body.appendChild(warningDiv);
  setTimeout(() => warningDiv.remove(), 5000);
}
```

### React Example

```typescript
import { useEffect, useState } from 'react';

interface AgentUpdate {
  timestamp: string;
  agent_id: string;
  agent_type: string;
  message: string;
  status: string;
  data?: any;
}

function useAgentUpdates(url: string) {
  const [updates, setUpdates] = useState<AgentUpdate[]>([]);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    const eventSource = new EventSource(url);

    eventSource.onopen = () => {
      console.log('📡 Connected to agent updates');
      setConnected(true);
    };

    eventSource.onmessage = (event) => {
      const update = JSON.parse(event.data) as AgentUpdate;
      setUpdates((prev) => [...prev, update]);
    };

    eventSource.onerror = () => {
      console.error('❌ SSE connection error');
      setConnected(false);
    };

    return () => {
      eventSource.close();
      setConnected(false);
    };
  }, [url]);

  return { updates, connected };
}

// Usage in component
function AgentDashboard() {
  const { updates, connected } = useAgentUpdates(
    'http://localhost:3001/agent/updates/stream'
  );

  return (
    <div className="agent-dashboard">
      <div className="connection-status">
        {connected ? '🟢 Connected' : '🔴 Disconnected'}
      </div>
      
      <div className="agent-updates">
        {updates.map((update, i) => (
          <div key={i} className={`update update-${update.status}`}>
            <span className="agent-type">{update.agent_type}</span>
            <span className="message">{update.message}</span>
            <span className="time">{new Date(update.timestamp).toLocaleTimeString()}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
```

---

## Complete Workflow Example

### Full Agent Lifecycle

```bash
#!/bin/bash

BASE_URL="http://localhost:3001"

echo "🎯 Starting Complete Agent Workflow Demo"
echo ""

# Step 1: Spawn agent
echo "1️⃣ Spawning Scout Agent..."
SPAWN_RESPONSE=$(curl -s -X POST "$BASE_URL/agent/spawn" \
  -H "Content-Type: application/json" \
  -d '{
    "agent_type": "scout",
    "query": "Find authentication files"
  }')

AGENT_ID=$(echo "$SPAWN_RESPONSE" | jq -r '.agent_id')
echo "   ✓ Spawned: $AGENT_ID"
echo ""

sleep 1

# Step 2: Progress updates
echo "2️⃣ Sending Progress Updates..."

curl -s -X POST "$BASE_URL/agent/$AGENT_ID/update" \
  -H "Content-Type: application/json" \
  -d '{
    "type": "progress",
    "message": "Initializing scan",
    "data": {"progress": 0},
    "deviation_score": 5
  }' > /dev/null

echo "   ✓ 0% - Initializing"

sleep 1

curl -s -X POST "$BASE_URL/agent/$AGENT_ID/update" \
  -H "Content-Type: application/json" \
  -d '{
    "type": "progress",
    "message": "Scanning directories",
    "data": {"progress": 25},
    "deviation_score": 10
  }' > /dev/null

echo "   ✓ 25% - Scanning"

sleep 1

# Step 3: Finding
echo "3️⃣ Agent Makes Discovery..."
curl -s -X POST "$BASE_URL/agent/$AGENT_ID/update" \
  -H "Content-Type: application/json" \
  -d '{
    "type": "finding",
    "message": "Found AuthService module",
    "data": {
      "importance": "high",
      "files": ["src/auth/AuthService.ts"]
    },
    "deviation_score": 12
  }' > /dev/null

echo "   ✓ Found critical files"

sleep 1

curl -s -X POST "$BASE_URL/agent/$AGENT_ID/update" \
  -H "Content-Type: application/json" \
  -d '{
    "type": "progress",
    "message": "Analyzing findings",
    "data": {"progress": 75},
    "deviation_score": 15
  }' > /dev/null

echo "   ✓ 75% - Analyzing"

sleep 1

# Step 4: Completion
echo "4️⃣ Completing Agent..."
curl -s -X POST "$BASE_URL/agent/$AGENT_ID/complete" \
  -H "Content-Type: application/json" \
  -d '{
    "findings": "Successfully found 5 authentication-related files in src/auth/ directory"
  }' > /dev/null

echo "   ✓ Agent completed successfully"
echo ""

# Step 5: Check final status
echo "5️⃣ Final Agent Status:"
curl -s "$BASE_URL/agent/$AGENT_ID/status" | jq '{
  id: .id,
  type: .type,
  status: .status,
  progress: .progress,
  update_count: (.updates | length)
}'

echo ""
echo "✅ Workflow complete!"
```

### Expected Output

```
🎯 Starting Complete Agent Workflow Demo

1️⃣ Spawning Scout Agent...
   ✓ Spawned: scout-1736438400000-abc123

2️⃣ Sending Progress Updates...
   ✓ 0% - Initializing
   ✓ 25% - Scanning

3️⃣ Agent Makes Discovery...
   ✓ Found critical files
   ✓ 75% - Analyzing

4️⃣ Completing Agent...
   ✓ Agent completed successfully

5️⃣ Final Agent Status:
{
  "id": "scout-1736438400000-abc123",
  "type": "scout",
  "status": "completed",
  "progress": 100,
  "update_count": 5
}

✅ Workflow complete!
```

---

## Manual Agent Termination

### Kill Agent Manually

```bash
curl -X POST http://localhost:3001/agent/scout-123/kill \
  -H "Content-Type: application/json" \
  -d '{
    "reason": "User requested termination - agent taking too long"
  }'
```

**Response:**
```json
{
  "agent_id": "scout-123",
  "status": "killed",
  "reason": "User requested termination - agent taking too long",
  "message": "Agent scout-123 terminated successfully"
}
```

---

## Query All Agents

### Get Active Agents Only

```bash
curl http://localhost:3001/agent/active | jq '.'
```

### Get All Agents (Including Terminated)

```bash
curl http://localhost:3001/agent/all | jq '.'
```

**Response:**
```json
{
  "count": 5,
  "agents": [
    {
      "id": "scout-123",
      "type": "scout",
      "status": "completed",
      "progress": 100
    },
    {
      "id": "analyzer-456",
      "type": "analyzer",
      "status": "killed",
      "kill_reason": "Agent went off-road (deviation: 85%)"
    },
    {
      "id": "implementer-789",
      "type": "implementer",
      "status": "running",
      "progress": 50
    }
  ]
}
```

---

## Error Handling

### Send Critical Error

```bash
curl -X POST http://localhost:3001/agent/tester-999/update \
  -H "Content-Type: application/json" \
  -d '{
    "type": "error",
    "message": "Test suite failed - cannot continue",
    "data": {
      "critical": true,
      "error_code": "TEST_FAILURE",
      "failed_tests": 5
    },
    "deviation_score": 20
  }'
```

**Result:** Agent automatically killed due to critical error.

---

## Integration with Master Agent Query

### Autonomous Agent Deployment

The Master Agent can automatically spawn, monitor, and coordinate sub-agents:

```bash
curl -X POST http://localhost:3001/agent/query \
  -H "Content-Type: application/json" \
  -d '{
    "query": "Add two-factor authentication to the login system"
  }'
```

**Behind the scenes:**
1. Master Agent analyzes the query
2. Decides to spawn: Scout → Analyzer → Implementer → Tester
3. Monitors each agent's progress
4. Auto-kills any agents that deviate
5. Synthesizes results from completed agents
6. Returns comprehensive solution to user

---

## Best Practices

### 1. Set Appropriate Deviation Scores
- **0-25%**: Agent is on track
- **25-50%**: Minor deviation, acceptable
- **50-75%**: Concerning, needs monitoring
- **75-100%**: Critical deviation, will be auto-killed

### 2. Send Regular Updates
- Update at least every 10-15 seconds
- No updates for >30s = agent killed as "stuck"

### 3. Use Meaningful Messages
```bash
# ✅ Good
"Analyzing authentication patterns in src/auth/"

# ❌ Bad
"Doing stuff"
```

### 4. Include Useful Data
```json
{
  "data": {
    "progress": 50,
    "files_analyzed": 10,
    "patterns_found": 3,
    "importance": "high"
  }
}
```

### 5. Handle Agent Death Gracefully
Always check if agents are still alive before continuing workflow.

---

## Troubleshooting

### Agent Killed Unexpectedly?
- Check deviation scores in agent status
- Review update history
- Verify agent wasn't stuck (no updates >30s)

### SSE Connection Drops?
- Implement reconnection logic
- Use heartbeat monitoring
- Handle connection errors gracefully

### Agent Not Receiving Kill Signal?
- Agents must poll their status
- Implement interrupt handlers
- Check network connectivity

---

**For more information, see the main [README.md](README.md)**
