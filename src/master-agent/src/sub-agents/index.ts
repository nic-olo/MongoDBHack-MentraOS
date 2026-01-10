/**
 * Sub-Agent Service
 * Provides mock sub-agents that Master Agent can call
 */
import { ScoutAgent } from './scout-agent.js';
import { AnalyzerAgent } from './analyzer-agent.js';
import { ImplementerAgent } from './implementer-agent.js';
import { TesterAgent } from './tester-agent.js';
import type { AgentType, AgentRequest, AgentResponse } from './types.js';

// Sub-agent registry
const agents = {
  scout: new ScoutAgent(),
  analyzer: new AnalyzerAgent(),
  implementer: new ImplementerAgent(),
  tester: new TesterAgent()
};

/**
 * Execute a sub-agent
 * In production, this would be an HTTP endpoint
 */
export async function executeSubAgent(request: AgentRequest): Promise<AgentResponse> {
  const agent = agents[request.agent_type];
  
  if (!agent) {
    throw new Error(`Unknown agent type: ${request.agent_type}`);
  }

  return await agent.execute(request.query, request.context || {});
}

// Export everything
export * from './types.js';
export { ScoutAgent, AnalyzerAgent, ImplementerAgent, TesterAgent };
