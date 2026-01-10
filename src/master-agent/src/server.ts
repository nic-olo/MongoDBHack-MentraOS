/**
 * Master Agent API Server
 * Express server that exposes Master Agent via HTTP endpoints
 */
import express, { Request, Response } from 'express';
import cors from 'cors';
import 'dotenv/config';
import { MasterAgent } from './master-agent.js';
import { AgentManager, type UserUpdate } from './agent-manager.js';
import type { AgentType } from './sub-agents/types.js';

const app = express();
const PORT = process.env.MASTER_AGENT_PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());

// Initialize Master Agent
const apiKey = process.env.ANTHROPIC_API_KEY;
if (!apiKey) {
  console.error('❌ ANTHROPIC_API_KEY not found in environment');
  process.exit(1);
}

const masterAgent = new MasterAgent(apiKey);

// Initialize Agent Manager (Command & Control)
const agentManager = new AgentManager();

// In-memory task storage (would be MongoDB in production)
const tasks = new Map<string, any>();

/**
 * POST /agent/query
 * Submit a query to the Master Agent
 */
app.post('/agent/query', async (req: Request, res: Response) => {
  try {
    const { query } = req.body;
    
    if (!query) {
      return res.status(400).json({ error: 'Query is required' });
    }

    const taskId = `task-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    // Store task as pending
    tasks.set(taskId, {
      id: taskId,
      query,
      status: 'processing',
      created_at: new Date().toISOString()
    });

    // Return immediately with task ID
    res.json({
      task_id: taskId,
      status: 'processing',
      message: 'Master Agent is processing your query'
    });

    // Process in background
    try {
      console.log(`\n🎯 Processing task ${taskId}: "${query}"`);
      const result = await masterAgent.processQuery(query);
      
      tasks.set(taskId, {
        id: taskId,
        query,
        status: 'completed',
        result,
        created_at: tasks.get(taskId)?.created_at,
        completed_at: new Date().toISOString()
      });
      
      console.log(`✅ Task ${taskId} completed\n`);
    } catch (error) {
      console.error(`❌ Task ${taskId} failed:`, error);
      tasks.set(taskId, {
        id: taskId,
        query,
        status: 'failed',
        error: error instanceof Error ? error.message : String(error),
        created_at: tasks.get(taskId)?.created_at,
        completed_at: new Date().toISOString()
      });
    }
  } catch (error) {
    console.error('Error processing request:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: error instanceof Error ? error.message : String(error)
    });
  }
});

/**
 * GET /agent/task/:taskId
 * Get task status and results
 */
app.get('/agent/task/:taskId', (req: Request, res: Response) => {
  const { taskId } = req.params;
  const task = tasks.get(taskId);
  
  if (!task) {
    return res.status(404).json({ error: 'Task not found' });
  }
  
  res.json(task);
});

/**
 * GET /agent/tasks
 * List all tasks
 */
app.get('/agent/tasks', (req: Request, res: Response) => {
  const allTasks = Array.from(tasks.values()).sort((a, b) => 
    new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );
  
  res.json({
    count: allTasks.length,
    tasks: allTasks
  });
});

// ========================================
// AGENT SPAWN/KILL/MONITOR ENDPOINTS
// ========================================

/**
 * POST /agent/spawn
 * Spawn a new sub-agent
 */
app.post('/agent/spawn', (req: Request, res: Response) => {
  try {
    const { agent_type, query } = req.body;
    
    if (!agent_type || !query) {
      return res.status(400).json({ error: 'agent_type and query are required' });
    }

    const validTypes: AgentType[] = ['scout', 'analyzer', 'implementer', 'tester'];
    if (!validTypes.includes(agent_type)) {
      return res.status(400).json({ 
        error: 'Invalid agent_type', 
        valid_types: validTypes 
      });
    }

    const agentId = agentManager.spawnAgent(agent_type, query);
    
    res.json({
      agent_id: agentId,
      agent_type,
      status: 'spawning',
      message: `Agent ${agentId} spawned successfully`
    });
  } catch (error) {
    console.error('Error spawning agent:', error);
    res.status(500).json({
      error: 'Failed to spawn agent',
      message: error instanceof Error ? error.message : String(error)
    });
  }
});

/**
 * POST /agent/:agentId/kill
 * Kill a running agent
 */
app.post('/agent/:agentId/kill', (req: Request, res: Response) => {
  try {
    const { agentId } = req.params;
    const { reason } = req.body;
    
    if (!reason) {
      return res.status(400).json({ error: 'reason is required' });
    }

    const success = agentManager.killAgent(agentId, reason);
    
    if (!success) {
      return res.status(404).json({ 
        error: 'Agent not found or already terminated',
        agent_id: agentId
      });
    }

    res.json({
      agent_id: agentId,
      status: 'killed',
      reason,
      message: `Agent ${agentId} terminated successfully`
    });
  } catch (error) {
    console.error('Error killing agent:', error);
    res.status(500).json({
      error: 'Failed to kill agent',
      message: error instanceof Error ? error.message : String(error)
    });
  }
});

/**
 * POST /agent/:agentId/update
 * Receive status update from a sub-agent
 * This is called BY the sub-agents to report progress
 */
app.post('/agent/:agentId/update', (req: Request, res: Response) => {
  try {
    const { agentId } = req.params;
    const { type, message, data, deviation_score } = req.body;
    
    if (!type || !message) {
      return res.status(400).json({ error: 'type and message are required' });
    }

    const validTypes = ['progress', 'finding', 'warning', 'error'];
    if (!validTypes.includes(type)) {
      return res.status(400).json({ 
        error: 'Invalid update type',
        valid_types: validTypes
      });
    }

    agentManager.receiveUpdate(agentId, {
      type,
      message,
      data,
      deviation_score
    });

    res.json({
      agent_id: agentId,
      status: 'update_received',
      message: 'Update processed successfully'
    });
  } catch (error) {
    console.error('Error processing agent update:', error);
    res.status(500).json({
      error: 'Failed to process update',
      message: error instanceof Error ? error.message : String(error)
    });
  }
});

/**
 * POST /agent/:agentId/complete
 * Mark agent as completed
 */
app.post('/agent/:agentId/complete', (req: Request, res: Response) => {
  try {
    const { agentId } = req.params;
    const { findings } = req.body;
    
    if (!findings) {
      return res.status(400).json({ error: 'findings are required' });
    }

    agentManager.completeAgent(agentId, findings);
    
    res.json({
      agent_id: agentId,
      status: 'completed',
      message: `Agent ${agentId} completed successfully`
    });
  } catch (error) {
    console.error('Error completing agent:', error);
    res.status(500).json({
      error: 'Failed to complete agent',
      message: error instanceof Error ? error.message : String(error)
    });
  }
});

/**
 * GET /agent/:agentId/status
 * Get status of a specific agent
 */
app.get('/agent/:agentId/status', (req: Request, res: Response) => {
  const { agentId } = req.params;
  const agent = agentManager.getAgent(agentId);
  
  if (!agent) {
    return res.status(404).json({ error: 'Agent not found' });
  }
  
  res.json(agent);
});

/**
 * GET /agent/active
 * Get all active agents
 */
app.get('/agent/active', (req: Request, res: Response) => {
  const activeAgents = agentManager.getActiveAgents();
  
  res.json({
    count: activeAgents.length,
    agents: activeAgents
  });
});

/**
 * GET /agent/all
 * Get all agents (including completed/killed)
 */
app.get('/agent/all', (req: Request, res: Response) => {
  const allAgents = agentManager.getAllAgents();
  
  res.json({
    count: allAgents.length,
    agents: allAgents
  });
});

/**
 * GET /agent/updates/stream
 * Server-Sent Events (SSE) stream for real-time user updates
 */
app.get('/agent/updates/stream', (req: Request, res: Response) => {
  // Set up SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  console.log('📡 New SSE client connected');

  // Send initial connection message
  res.write(`data: ${JSON.stringify({ 
    type: 'connected', 
    message: 'Connected to agent updates stream',
    timestamp: new Date().toISOString()
  })}\n\n`);

  // Listen for user updates from AgentManager
  const updateHandler = (update: UserUpdate) => {
    res.write(`data: ${JSON.stringify(update)}\n\n`);
  };

  agentManager.on('user_update', updateHandler);

  // Heartbeat to keep connection alive
  const heartbeat = setInterval(() => {
    res.write(`:heartbeat ${Date.now()}\n\n`);
  }, 30000);

  // Clean up on client disconnect
  req.on('close', () => {
    console.log('📡 SSE client disconnected');
    clearInterval(heartbeat);
    agentManager.off('user_update', updateHandler);
  });
});

/**
 * GET /health
 * Health check
 */
app.get('/health', (req: Request, res: Response) => {
  const activeAgents = agentManager.getActiveAgents();
  
  res.json({
    status: 'healthy',
    service: 'Master Agent API',
    timestamp: new Date().toISOString(),
    tasks_count: tasks.size,
    active_agents: activeAgents.length
  });
});

/**
 * GET /
 * Root endpoint with API info
 */
app.get('/', (req: Request, res: Response) => {
  res.json({
    service: 'Master Agent API',
    version: '0.2.0',
    endpoints: {
      // Master Agent Orchestration
      'POST /agent/query': 'Submit a query to Master Agent',
      'GET /agent/task/:taskId': 'Get task status and results',
      'GET /agent/tasks': 'List all tasks',
      
      // Agent Spawn/Kill/Monitor
      'POST /agent/spawn': 'Spawn a new sub-agent',
      'POST /agent/:agentId/kill': 'Kill a running agent',
      'POST /agent/:agentId/update': 'Receive status update from agent',
      'POST /agent/:agentId/complete': 'Mark agent as completed',
      'GET /agent/:agentId/status': 'Get agent status',
      'GET /agent/active': 'Get all active agents',
      'GET /agent/all': 'Get all agents (including terminated)',
      'GET /agent/updates/stream': 'SSE stream for real-time updates',
      
      // System
      'GET /health': 'Health check'
    },
    examples: {
      query: {
        method: 'POST',
        url: '/agent/query',
        body: {
          query: 'Add category filtering to notifications'
        }
      },
      spawn_agent: {
        method: 'POST',
        url: '/agent/spawn',
        body: {
          agent_type: 'scout',
          query: 'Find all authentication related files'
        }
      },
      agent_update: {
        method: 'POST',
        url: '/agent/scout-123/update',
        body: {
          type: 'progress',
          message: 'Scanning directory structure',
          data: { progress: 50 },
          deviation_score: 10
        }
      },
      kill_agent: {
        method: 'POST',
        url: '/agent/scout-123/kill',
        body: {
          reason: 'Agent going off-track'
        }
      }
    }
  });
});

// Start server
app.listen(PORT, () => {
  console.log('\n' + '='.repeat(60));
  console.log('🤖 MASTER AGENT API SERVER');
  console.log('='.repeat(60));
  console.log(`\n📍 Server running on: http://localhost:${PORT}`);
  console.log(`📖 API Info: http://localhost:${PORT}`);
  console.log(`💚 Health Check: http://localhost:${PORT}/health`);
  console.log('\n📝 Endpoints:');
  console.log(`   POST   http://localhost:${PORT}/agent/query`);
  console.log(`   GET    http://localhost:${PORT}/agent/task/:taskId`);
  console.log(`   GET    http://localhost:${PORT}/agent/tasks`);
  console.log('\n' + '='.repeat(60) + '\n');
});
