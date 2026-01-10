/**
 * Master Agent API Server
 * Express server that exposes Master Agent via HTTP endpoints
 */
import express, { Request, Response } from 'express';
import cors from 'cors';
import 'dotenv/config';
import { MasterAgent } from './master-agent.js';

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

/**
 * GET /health
 * Health check
 */
app.get('/health', (req: Request, res: Response) => {
  res.json({
    status: 'healthy',
    service: 'Master Agent API',
    timestamp: new Date().toISOString(),
    tasks_count: tasks.size
  });
});

/**
 * GET /
 * Root endpoint with API info
 */
app.get('/', (req: Request, res: Response) => {
  res.json({
    service: 'Master Agent API',
    version: '0.1.0',
    endpoints: {
      'POST /agent/query': 'Submit a query to Master Agent',
      'GET /agent/task/:taskId': 'Get task status and results',
      'GET /agent/tasks': 'List all tasks',
      'GET /health': 'Health check'
    },
    example: {
      query: {
        method: 'POST',
        url: '/agent/query',
        body: {
          query: 'Add category filtering to notifications'
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
