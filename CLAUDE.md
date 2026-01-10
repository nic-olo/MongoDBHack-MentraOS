# Bun Agent - Desktop Daemon System

AI agent system with a desktop daemon that connects to a cloud backend to execute sub-agents on the user's machine.

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                         CLOUD                                    │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │              DaemonManager (src/server/daemon/)           │   │
│  │  - Manages WebSocket connections to daemons               │   │
│  │  - Sends commands: spawn_agent, kill_agent                │   │
│  │  - Receives status updates via REST                       │   │
│  │  - Emits events for master agent integration              │   │
│  └──────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
                              │
                              │ WS (commands down)
                              │ REST (updates up)
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    USER'S MACHINE                                │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │              DesktopDaemon (daemon/)                      │   │
│  │  - Connects to cloud via WebSocket                        │   │
│  │  - Spawns TerminalAgents (Claude CLI in PTY)              │   │
│  │  - Uses LLM observer for intelligent state detection      │   │
│  │  - Reports status/completion via REST                     │   │
│  └──────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

## Project Structure

```
bun-agent/
├── daemon/                     # Desktop daemon (Bun project)
│   ├── src/
│   │   ├── index.ts            # Entry point, CLI commands
│   │   ├── daemon-client.ts    # WebSocket + REST client to cloud
│   │   ├── agent-pool.ts       # Manages multiple running agents
│   │   ├── terminal-agent.ts   # Claude CLI controller with PTY
│   │   ├── observer.ts         # LLM observer (Gemini Flash)
│   │   ├── config.ts           # Token/config storage (~/.desktop-daemon/)
│   │   └── types.ts            # Shared type definitions
│   └── package.json
│
├── src/                        # Cloud backend (MentraOS app)
│   ├── server/
│   │   ├── daemon/             # Daemon management module
│   │   │   ├── DaemonManager.ts  # Cloud-side daemon controller
│   │   │   ├── routes.ts         # REST endpoint handlers
│   │   │   ├── types.ts          # Type definitions
│   │   │   └── index.ts          # Barrel exports
│   │   └── ...
│   ├── master-agent/           # Master agent with sub-agents
│   └── frontend/               # Web UI
│
└── old-experiment/             # Original experiment code (reference)
```

## Daemon Commands

```bash
cd daemon

# Authenticate daemon (one-time setup)
bun run src/index.ts auth <token> [serverUrl]

# Check configuration status
bun run src/index.ts status

# Start daemon
bun run start
```

## Communication Protocol

### WebSocket (Cloud → Daemon)

Commands sent from cloud to daemon:
- `spawn_agent`: Create a new terminal agent
- `kill_agent`: Stop a running agent
- `ping`: Health check

### REST (Daemon → Cloud)

Endpoints the daemon calls:
- `POST /api/daemon/heartbeat` - Periodic health check
- `POST /api/subagent/:id/status` - Agent status updates
- `POST /api/subagent/:id/complete` - Agent completion
- `POST /api/subagent/:id/log` - Terminal output streaming

## Key Components

### TerminalAgent
- Spawns Claude CLI in a PTY terminal
- Uses LLM observer (Gemini Flash) for intelligent state detection
- Auto-approves permission prompts
- Detects completion, errors, and edge cases

### LLM Observer
- Analyzes terminal buffer to determine state
- States: initializing, ready, working, needs_approval, completed, error
- Actions: wait, send_approval, report_complete, report_error
- Fast and cheap (~$0.006 per task with Gemini Flash)

### DaemonManager (Cloud-side)
- Manages WebSocket connections from daemons
- Tracks daemon and agent state
- Emits events for master agent integration
- Provides Express/Bun route handlers

## Environment Variables

### Daemon
- `GEMINI_API_KEY` - For LLM observer
- `DAEMON_SERVER_URL` - Backend server URL (default: http://localhost:3000)

### Cloud
- Standard MentraOS environment variables