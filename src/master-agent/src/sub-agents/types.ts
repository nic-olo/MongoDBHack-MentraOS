/**
 * Sub-Agent types and interfaces
 */

export type AgentType = 'scout' | 'analyzer' | 'implementer' | 'tester';

export interface AgentRequest {
  agent_type: AgentType;
  query: string;
  context?: Record<string, any>;
}

export interface AgentResponse {
  agent_id: string;
  agent_type: AgentType;
  status: 'completed' | 'failed';
  findings: string;
  data?: Record<string, any>;
  error?: string;
  execution_time_ms: number;
}
