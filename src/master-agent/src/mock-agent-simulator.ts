/**
 * Mock Agent Simulator
 * Simulates a sub-agent's behavior for testing the AgentManager
 * In real implementation, actual sub-agents would report to these endpoints
 */

interface SimulatorConfig {
  baseUrl: string;
  agentId: string;
  behavior: 'normal' | 'high_deviation' | 'stuck' | 'error';
}

/**
 * Simulates an agent running and sending updates
 */
export class MockAgentSimulator {
  private config: SimulatorConfig;
  private running: boolean = false;
  private intervalId?: NodeJS.Timeout;

  constructor(config: SimulatorConfig) {
    this.config = config;
  }

  /**
   * Start simulating agent behavior
   */
  async start(): Promise<void> {
    this.running = true;
    console.log(`🤖 Mock Agent ${this.config.agentId} starting (${this.config.behavior} mode)`);

    switch (this.config.behavior) {
      case 'normal':
        await this.simulateNormalBehavior();
        break;
      case 'high_deviation':
        await this.simulateHighDeviation();
        break;
      case 'stuck':
        await this.simulateStuckAgent();
        break;
      case 'error':
        await this.simulateErrorBehavior();
        break;
    }
  }

  /**
   * Stop the simulation
   */
  stop(): void {
    this.running = false;
    if (this.intervalId) {
      clearInterval(this.intervalId);
    }
    console.log(`🛑 Mock Agent ${this.config.agentId} stopped`);
  }

  /**
   * Normal agent behavior - progresses smoothly
   */
  private async simulateNormalBehavior(): Promise<void> {
    const steps = [
      { progress: 0, message: 'Initializing agent', deviation: 5 },
      { progress: 25, message: 'Scanning codebase structure', deviation: 10 },
      { progress: 50, message: 'Analyzing dependencies', deviation: 15 },
      { progress: 75, message: 'Identifying relevant files', deviation: 12 },
      { progress: 100, message: 'Analysis complete', deviation: 8 }
    ];

    for (const step of steps) {
      if (!this.running) break;

      await this.sendUpdate({
        type: 'progress',
        message: step.message,
        data: { progress: step.progress },
        deviation_score: step.deviation
      });

      // Send a finding at 50%
      if (step.progress === 50) {
        await this.sendUpdate({
          type: 'finding',
          message: 'Discovered key authentication module',
          data: {
            importance: 'high',
            files: ['src/auth/login.ts', 'src/auth/session.ts']
          },
          deviation_score: 10
        });
      }

      await this.sleep(2000); // 2 second delay
    }

    if (this.running) {
      await this.complete('Successfully analyzed authentication patterns and identified 5 key files');
    }
  }

  /**
   * High deviation behavior - agent goes off-road
   */
  private async simulateHighDeviation(): Promise<void> {
    const steps = [
      { progress: 0, message: 'Starting analysis', deviation: 5 },
      { progress: 20, message: 'Analyzing target files', deviation: 15 },
      { progress: 40, message: 'Exploring related modules', deviation: 35 },
      { progress: 50, message: 'Investigating unrelated components', deviation: 60 },
      { progress: 60, message: 'Deep diving into database layer', deviation: 85 }
    ];

    for (const step of steps) {
      if (!this.running) break;

      await this.sendUpdate({
        type: step.deviation > 70 ? 'warning' : 'progress',
        message: step.message,
        data: { progress: step.progress },
        deviation_score: step.deviation
      });

      await this.sleep(1500);

      // Should be killed around 75-85% deviation
      if (step.deviation > 75) {
        console.log(`💀 Agent should be killed soon (deviation: ${step.deviation}%)`);
      }
    }
  }

  /**
   * Stuck behavior - stops sending updates
   */
  private async simulateStuckAgent(): Promise<void> {
    await this.sendUpdate({
      type: 'progress',
      message: 'Starting analysis',
      data: { progress: 0 },
      deviation_score: 5
    });

    await this.sleep(2000);

    await this.sendUpdate({
      type: 'progress',
      message: 'Scanning files...',
      data: { progress: 20 },
      deviation_score: 10
    });

    console.log(`😴 Agent ${this.config.agentId} is now stuck (no more updates)`);
    // No more updates - should be killed after timeout
  }

  /**
   * Error behavior - encounters critical error
   */
  private async simulateErrorBehavior(): Promise<void> {
    await this.sendUpdate({
      type: 'progress',
      message: 'Starting analysis',
      data: { progress: 0 },
      deviation_score: 5
    });

    await this.sleep(1000);

    await this.sendUpdate({
      type: 'error',
      message: 'Critical error: Unable to access required files',
      data: {
        critical: true,
        error_code: 'ACCESS_DENIED'
      },
      deviation_score: 20
    });

    console.log(`💥 Agent ${this.config.agentId} encountered critical error`);
  }

  /**
   * Send update to master agent
   */
  private async sendUpdate(update: any): Promise<void> {
    try {
      const response = await fetch(`${this.config.baseUrl}/agent/${this.config.agentId}/update`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(update)
      });

      if (!response.ok) {
        console.error(`❌ Failed to send update: ${response.status}`);
      } else {
        console.log(`📡 Sent ${update.type}: ${update.message} (deviation: ${update.deviation_score}%)`);
      }
    } catch (error) {
      console.error('❌ Error sending update:', error);
    }
  }

  /**
   * Mark agent as complete
   */
  private async complete(findings: string): Promise<void> {
    try {
      const response = await fetch(`${this.config.baseUrl}/agent/${this.config.agentId}/complete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ findings })
      });

      if (response.ok) {
        console.log(`✅ Agent ${this.config.agentId} completed: ${findings}`);
      }
    } catch (error) {
      console.error('❌ Error completing agent:', error);
    }
  }

  /**
   * Sleep utility
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

/**
 * Demo: Spawn and simulate multiple agents
 */
export async function runAgentDemo(baseUrl: string = 'http://localhost:3001'): Promise<void> {
  console.log('\n' + '='.repeat(60));
  console.log('🎮 MOCK AGENT SIMULATOR DEMO');
  console.log('='.repeat(60) + '\n');

  // Spawn agents via API
  const agents = await Promise.all([
    spawnAgent(baseUrl, 'scout', 'Find authentication files'),
    spawnAgent(baseUrl, 'analyzer', 'Analyze auth patterns'),
    spawnAgent(baseUrl, 'implementer', 'Add validation')
  ]);

  const [scoutId, analyzerId, implementerId] = agents;

  // Create simulators with different behaviors
  const simulators = [
    new MockAgentSimulator({
      baseUrl,
      agentId: scoutId,
      behavior: 'normal'
    }),
    new MockAgentSimulator({
      baseUrl,
      agentId: analyzerId,
      behavior: 'high_deviation'
    }),
    new MockAgentSimulator({
      baseUrl,
      agentId: implementerId,
      behavior: 'stuck'
    })
  ];

  // Start all simulators
  console.log('\n🚀 Starting agent simulations...\n');
  simulators.forEach(sim => sim.start());

  // Let them run
  console.log('\n⏱️  Simulations running... (press Ctrl+C to stop)\n');
}

/**
 * Helper: Spawn an agent via API
 */
async function spawnAgent(baseUrl: string, type: string, query: string): Promise<string> {
  try {
    const response = await fetch(`${baseUrl}/agent/spawn`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ agent_type: type, query })
    });

    if (!response.ok) {
      throw new Error(`Failed to spawn agent: ${response.status}`);
    }

    const data = await response.json() as { agent_id: string };
    console.log(`✓ Spawned ${type} agent: ${data.agent_id}`);
    return data.agent_id;
  } catch (error) {
    console.error(`❌ Error spawning ${type} agent:`, error);
    throw error;
  }
}

// Run demo if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runAgentDemo().catch(console.error);
}
