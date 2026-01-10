/**
 * Type definitions for Master Agent system
 */

export interface ToolResult {
  tool: string;
  [key: string]: any;
}

export interface AgentResult {
  query: string;
  agents_used: string[];
  agent_results: Record<string, any>;
  synthesis: string;
  timestamp: string;
}

export interface ToolFunction {
  (params: Record<string, any>): Promise<ToolResult>;
}
