# Master Agent - TypeScript Version

AI orchestrator that analyzes queries, decides which tools to use, coordinates execution, and synthesizes results.

## Architecture

```
User Query
    ↓
📊 Analysis: Master Agent uses Claude to understand task
    ↓
🧠 Decision: Determines which tools to call (strategic thinking)
    ↓
⚡ Execution: Runs tools in optimal order
    ↓
🔬 Synthesis: Combines findings into actionable answer
```

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

### 3. Run POC

```bash
npm run poc
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

## Available Mock Tools

- `file_search(query)` - Find files in codebase
- `code_read(file_path)` - Read code from file
- `code_analyze(files)` - Analyze code structure
- `test_run(test_path)` - Run tests

## Development

```bash
# Run in dev mode (with auto-reload)
npm run dev

# Build TypeScript
npm run build

# Run built version
npm start
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

## Next Steps

1. **Add Real Tools**: Replace mocks with actual implementations
2. **MongoDB Integration**: Store tasks and results
3. **WebSocket Streaming**: Live progress updates
4. **Sub-Agent System**: Deploy actual specialist agents
5. **Dashboard UI**: Visualize agent execution

## License

MIT
