/**
 * Agent Manager - Tracks and controls active sub-agents
 * Handles spawning, killing, and monitoring agent behavior
 */

import { EventEmitter } from 'events';
import type { AgentType } from './sub-agents/types.js';

export interface ActiveAgent {
  id: string;
  type: AgentType;
  query: string;
  status: 'spawning' | 'running' | 'completed' | 'killed' | 'failed';
  progress: number; // 0-100
  spawned_at: Date;
  last_update: Date;
  updates: AgentUpdate[];
  kill_reason?: string;
}

export interface AgentUpdate {
  timestamp: Date;
  type: 'progress' | 'finding' | 'warning' | 'error';
  message: string;
  data?: any;
  deviation_score?: number; // 0-100, higher = more off-track
}

export interface UserUpdate {
  timestamp: Date;
  agent_id: string;
  agent_type: AgentType;
  message: string;
  status: string;
  data?: any;
}

/**
 * Agent Manager - Command & Control for Sub-Agents
 */
export class AgentManager extends EventEmitter {
  private agents: Map<string, ActiveAgent> = new Map();
  private readonly DEVIATION_THRESHOLD = 75; // Kill if deviation > 75%
  private readonly MAX_NO_UPDATE_MS = 30000; // 30 seconds
  
  constructor() {
    super();
    this.startMonitoring();
  }

  /**
   * Spawn a new agent
   */
  spawnAgent(type: AgentType, query: string): string {
    const agentId = `${type}-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`;
    
    const agent: ActiveAgent = {
      id: agentId,
      type,
      query,
      status: 'spawning',
      progress: 0,
      spawned_at: new Date(),
      last_update: new Date(),
      updates: []
    };

    this.agents.set(agentId, agent);
    
    console.log(`🚀 SPAWN: Agent ${agentId} (${type})`);
    
    // Emit to user
    this.emitUserUpdate({
      timestamp: new Date(),
      agent_id: agentId,
      agent_type: type,
      message: `Spawned ${type} agent for: ${query}`,
      status: 'spawning'
    });

    // Mark as running
    setTimeout(() => {
      const a = this.agents.get(agentId);
      if (a && a.status === 'spawning') {
        a.status = 'running';
        this.emitUserUpdate({
          timestamp: new Date(),
          agent_id: agentId,
          agent_type: type,
          message: `${type} agent is now operational`,
          status: 'running'
        });
      }
    }, 500);

    return agentId;
  }

  /**
   * Kill an agent (forced termination)
   */
  killAgent(agentId: string, reason: string): boolean {
    const agent = this.agents.get(agentId);
    
    if (!agent) {
      console.warn(`⚠️  Cannot kill unknown agent: ${agentId}`);
      return false;
    }

    if (agent.status === 'killed' || agent.status === 'completed') {
      console.warn(`⚠️  Agent ${agentId} already terminated`);
      return false;
    }

    agent.status = 'killed';
    agent.kill_reason = reason;
    agent.last_update = new Date();

    console.log(`💀 KILL: Agent ${agentId} - Reason: ${reason}`);
    
    this.emitUserUpdate({
      timestamp: new Date(),
      agent_id: agentId,
      agent_type: agent.type,
      message: `Terminated ${agent.type} agent: ${reason}`,
      status: 'killed',
      data: { reason }
    });

    return true;
  }

  /**
   * Receive update from sub-agent
   * THIS IS THE KEY METHOD - decides if agent should be killed or user updated
   */
  receiveUpdate(agentId: string, update: Omit<AgentUpdate, 'timestamp'>): void {
    const agent = this.agents.get(agentId);
    
    if (!agent) {
      console.warn(`⚠️  Update from unknown agent: ${agentId}`);
      return;
    }

    if (agent.status === 'killed') {
      console.warn(`⚠️  Ignoring update from killed agent: ${agentId}`);
      return;
    }

    // Add timestamp
    const fullUpdate: AgentUpdate = {
      ...update,
      timestamp: new Date()
    };

    agent.updates.push(fullUpdate);
    agent.last_update = new Date();

    console.log(`📡 UPDATE from ${agentId} [${update.type}]: ${update.message}`);

    // DECISION LOGIC: Should we kill this agent?
    if (this.shouldKillAgent(agent, fullUpdate)) {
      this.killAgent(agentId, `Agent went off-road (deviation: ${fullUpdate.deviation_score}%)`);
      return;
    }

    // Update progress if provided
    if (update.data?.progress !== undefined) {
      agent.progress = update.data.progress;
    }

    // DECISION LOGIC: Should we push to user?
    if (this.shouldNotifyUser(agent, fullUpdate)) {
      this.emitUserUpdate({
        timestamp: fullUpdate.timestamp,
        agent_id: agentId,
        agent_type: agent.type,
        message: fullUpdate.message,
        status: agent.status,
        data: update.data
      });
    }
  }

  /**
   * DECISION MATRIX: Should this agent be killed?
   */
  private shouldKillAgent(agent: ActiveAgent, update: AgentUpdate): boolean {
    // Kill if deviation score too high
    if (update.deviation_score && update.deviation_score > this.DEVIATION_THRESHOLD) {
      console.log(`🎯 KILL DECISION: Deviation ${update.deviation_score}% > threshold ${this.DEVIATION_THRESHOLD}%`);
      return true;
    }

    // Kill if error is critical
    if (update.type === 'error' && update.data?.critical) {
      console.log(`🎯 KILL DECISION: Critical error detected`);
      return true;
    }

    // Kill if agent is stuck (implemented in monitoring loop)
    return false;
  }

  /**
   * DECISION MATRIX: Should we notify the user about this update?
   */
  private shouldNotifyUser(agent: ActiveAgent, update: AgentUpdate): boolean {
    // Always notify on warnings and errors
    if (update.type === 'warning' || update.type === 'error') {
      return true;
    }

    // Notify on significant findings
    if (update.type === 'finding' && update.data?.importance === 'high') {
      return true;
    }

    // Notify on major progress milestones (every 25%)
    if (update.type === 'progress' && agent.progress % 25 === 0) {
      return true;
    }

    // Throttle: Only notify if last user update was > 5 seconds ago
    const lastUserUpdate = agent.updates
      .filter(u => u.type === 'finding' || u.type === 'progress')
      .pop();
    
    if (!lastUserUpdate || (Date.now() - lastUserUpdate.timestamp.getTime()) > 5000) {
      return true;
    }

    return false;
  }

  /**
   * Mark agent as completed
   */
  completeAgent(agentId: string, findings: string): void {
    const agent = this.agents.get(agentId);
    
    if (!agent) {
      return;
    }

    agent.status = 'completed';
    agent.progress = 100;
    agent.last_update = new Date();

    console.log(`✅ COMPLETE: Agent ${agentId}`);
    
    this.emitUserUpdate({
      timestamp: new Date(),
      agent_id: agentId,
      agent_type: agent.type,
      message: `${agent.type} agent completed: ${findings}`,
      status: 'completed',
      data: { findings }
    });
  }

  /**
   * Get agent status
   */
  getAgent(agentId: string): ActiveAgent | undefined {
    return this.agents.get(agentId);
  }

  /**
   * Get all agents
   */
  getAllAgents(): ActiveAgent[] {
    return Array.from(this.agents.values());
  }

  /**
   * Get active agents (not completed/killed)
   */
  getActiveAgents(): ActiveAgent[] {
    return this.getAllAgents().filter(a => 
      a.status === 'spawning' || a.status === 'running'
    );
  }

  /**
   * Emit user update (other parts of system can listen)
   */
  private emitUserUpdate(update: UserUpdate): void {
    this.emit('user_update', update);
  }

  /**
   * Background monitoring - kills stuck agents
   */
  private startMonitoring(): void {
    setInterval(() => {
      const now = Date.now();
      
      for (const agent of this.getActiveAgents()) {
        const timeSinceUpdate = now - agent.last_update.getTime();
        
        if (timeSinceUpdate > this.MAX_NO_UPDATE_MS) {
          console.log(`🎯 KILL DECISION: Agent ${agent.id} stuck (no update for ${timeSinceUpdate}ms)`);
          this.killAgent(agent.id, `No updates for ${Math.round(timeSinceUpdate / 1000)}s - appears stuck`);
        }
      }
    }, 5000); // Check every 5 seconds
  }

  /**
   * Clean up old agents (housekeeping)
   */
  cleanupOldAgents(maxAgeMs: number = 3600000): void {
    const now = Date.now();
    let cleaned = 0;

    for (const [id, agent] of this.agents.entries()) {
      if (agent.status === 'completed' || agent.status === 'killed') {
        const age = now - agent.spawned_at.getTime();
        if (age > maxAgeMs) {
          this.agents.delete(id);
          cleaned++;
        }
      }
    }

    if (cleaned > 0) {
      console.log(`🧹 Cleaned up ${cleaned} old agents`);
    }
  }
}
