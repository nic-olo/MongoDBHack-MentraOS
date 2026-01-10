/**
 * Master Agent - The Orchestrator
 * Analyzes queries, decides which SUB-AGENTS to call, coordinates execution, synthesizes results
 */
import Anthropic from '@anthropic-ai/sdk';
import type { AgentResult } from './types.js';
import { executeSubAgent, type AgentType, type AgentResponse } from './sub-agents/index.js';

interface AgentMission {
  agent_type: AgentType;
  query: string;
  depends_on: string[];
}

export class MasterAgent {
  private client: Anthropic;
  private model: string = 'claude-sonnet-4-20250514';

  constructor(apiKey: string) {
    this.client = new Anthropic({ apiKey });
  }

  /**
   * Main orchestration pipeline
   */
  async processQuery(query: string): Promise<AgentResult> {
    console.log('\n' + '='.repeat(60));
    console.log('🎯 MASTER AGENT: Processing query');
    console.log('='.repeat(60));
    console.log(`Query: ${query}\n`);

    // Phase 1: Decide which SUB-AGENTS to call
    console.log('📊 Phase 1: Analyzing query and selecting sub-agents...');
    const agentPlan = await this.decideAgents(query);
    console.log(`✓ Selected ${agentPlan.length} sub-agents\n`);

    // Phase 2: Execute sub-agents
    console.log('⚡ Phase 2: Executing sub-agents...');
    const agentResults = await this.executeAgents(agentPlan);
    console.log('✓ All sub-agents completed\n');

    // Phase 3: Synthesize results
    console.log('🔬 Phase 3: Synthesizing results...');
    const synthesis = await this.synthesize(query, agentResults);
    console.log('✓ Synthesis complete\n');

    return {
      query,
      agents_used: agentPlan.map(a => a.agent_type),
      agent_results: agentResults,
      synthesis,
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Use Claude to decide which SUB-AGENTS to call (THE KEY INTELLIGENCE)
   */
  private async decideAgents(query: string): Promise<AgentMission[]> {
    const prompt = `You are a Master AI Agent that orchestrates specialist sub-agents.

Available Sub-Agents:
- scout: Finds files, maps dependencies, analyzes codebase structure
- analyzer: Deep code understanding, architecture analysis, pattern detection
- implementer: Writes/modifies code based on specifications
- tester: Runs tests and validates changes

User query: "${query}"

Decide which sub-agents to deploy and in what order. Return ONLY a JSON array:

[
  {
    "agent_type": "scout",
    "query": "Find all notification filter related files and dependencies",
    "depends_on": []
  },
  {
    "agent_type": "analyzer",
    "query": "Analyze current notification filter implementation",
    "depends_on": ["scout"]
  }
]

Rules:
- Only deploy agents you actually need
- Be specific in your queries to each agent
- Use depends_on to sequence agents that need previous results
- Think strategically about the most efficient path

Return ONLY the JSON array, no other text.`;

    const response = await this.client.messages.create({
      model: this.model,
      max_tokens: 2000,
      messages: [{ role: 'user', content: prompt }]
    });

    const content = response.content[0];
    if (content.type !== 'text') {
      throw new Error('Expected text response from Claude');
    }

    // Extract JSON from response
    let text = content.text.trim();
    if (text.includes('```json')) {
      text = text.split('```json')[1].split('```')[0];
    } else if (text.includes('```')) {
      text = text.split('```')[1].split('```')[0];
    }

    const agentPlan = JSON.parse(text.trim()) as AgentMission[];

    // Print the plan
    console.log('\n  🧠 Master Agent\'s Deployment Plan:');
    agentPlan.forEach((mission, i) => {
      const deps = mission.depends_on.length > 0 
        ? ` (after ${mission.depends_on.join(', ')})` 
        : '';
      console.log(`     ${i + 1}. ${mission.agent_type}${deps}`);
      console.log(`        Mission: "${mission.query}"`);
    });
    console.log();

    return agentPlan;
  }

  /**
   * Execute sub-agents in optimal order (respecting dependencies)
   */
  private async executeAgents(agentPlan: AgentMission[]): Promise<Record<string, AgentResponse>> {
    const results: Record<string, AgentResponse> = {};
    const completed = new Set<string>();

    // Create execution phases based on dependencies
    const phases = this.createExecutionPhases(agentPlan);

    for (let phaseNum = 0; phaseNum < phases.length; phaseNum++) {
      const phase = phases[phaseNum];
      console.log(`  🚀 Phase ${phaseNum + 1}: ${phase.map(m => m.agent_type).join(', ')}`);

      // Execute all agents in this phase in parallel
      const phaseResults = await Promise.all(
        phase.map(async (mission) => {
          // Build context from previous agents
          const context: Record<string, any> = {};
          for (const dep of mission.depends_on) {
            if (results[dep]) {
              context[`${dep}_findings`] = results[dep].findings;
              context[`${dep}_data`] = results[dep].data;
            }
          }

          // Call the sub-agent
          const result = await executeSubAgent({
            agent_type: mission.agent_type,
            query: mission.query,
            context
          });

          return { type: mission.agent_type, result };
        })
      );

      // Store results
      for (const { type, result } of phaseResults) {
        results[type] = result;
        completed.add(type);
      }

      console.log();
    }

    return results;
  }

  /**
   * Group agent missions into phases based on dependencies
   */
  private createExecutionPhases(missions: AgentMission[]): AgentMission[][] {
    const phases: AgentMission[][] = [];
    const remaining = [...missions];
    const completed = new Set<string>();

    while (remaining.length > 0) {
      // Find missions with satisfied dependencies
      const phase = remaining.filter(m =>
        m.depends_on.every(dep => completed.has(dep))
      );

      if (phase.length === 0) {
        throw new Error('Circular dependency detected in agent missions');
      }

      phases.push(phase);
      
      // Remove from remaining and mark as completed
      for (const mission of phase) {
        const index = remaining.indexOf(mission);
        remaining.splice(index, 1);
        completed.add(mission.agent_type);
      }
    }

    return phases;
  }

  /**
   * Synthesize sub-agent results into final answer
   */
  private async synthesize(query: string, agentResults: Record<string, AgentResponse>): Promise<string> {
    // Format agent results for Claude
    const resultsText = Object.entries(agentResults)
      .map(([type, result]) => {
        return `=== ${type.toUpperCase()} AGENT (${result.agent_id}) ===
Status: ${result.status}
Execution Time: ${result.execution_time_ms}ms

Findings:
${result.findings}
${result.data ? `\nData: ${JSON.stringify(result.data, null, 2)}` : ''}`;
      })
      .join('\n\n');

    const prompt = `You orchestrated specialist AI agents to accomplish this task: "${query}"

Agent Reports:
${resultsText}

Synthesize these findings into a comprehensive, actionable response for the user.

Include:
1. **Summary** - What was accomplished
2. **Key Discoveries** - Important findings from each agent
3. **Implementation Details** - What was changed (if applicable)
4. **Recommendations** - Next steps or considerations
5. **Confidence Level** - How confident you are in the solution

Be thorough but concise. Focus on actionable insights.`;

    const response = await this.client.messages.create({
      model: this.model,
      max_tokens: 3000,
      messages: [{ role: 'user', content: prompt }]
    });

    const content = response.content[0];
    if (content.type !== 'text') {
      throw new Error('Expected text response from Claude');
    }

    return content.text;
  }
}
