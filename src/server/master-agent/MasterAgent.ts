/**
 * MasterAgent
 * The intelligent orchestrator that processes user queries
 *
 * Features:
 * - Decision flow: direct_response / clarifying_question / spawn_agent
 * - Tool use loop for querying user context
 * - Conversation history integration
 * - Dual output: glassesDisplay (short) + webviewContent (full)
 * - Models: Haiku 4.5 (fast) + Sonnet 4.5 (smart)
 */

import Anthropic from "@anthropic-ai/sdk";
import { getDb, isConnected } from "../db/mongo";
import { getDaemonManager } from "../daemon/DaemonManager";
import { getConversationService, type Conversation } from "../conversation";
import {
  MasterAgentTools,
  TOOL_DEFINITIONS,
  createMasterAgentTools,
} from "./MasterAgentTools";
import {
  MODELS,
  type MasterAgentDecision,
  type TaskResult,
  type Task,
  type DecisionType,
} from "./types";

/**
 * System prompt for MasterAgent decision making
 */
const DECISION_SYSTEM_PROMPT = `You are a Master AI Agent that helps users with coding tasks and questions.

You have access to tools to query the user's context (recent tasks, running agents, daemon status).

Based on the user's query and conversation history, you must decide ONE of three actions:

1. DIRECT_RESPONSE - Answer immediately when:
   - It's a knowledge/explanation question (e.g., "What is React?")
   - It's asking for advice or best practices
   - It doesn't require accessing the user's codebase
   - You can answer from your training data

2. CLARIFYING_QUESTION - Ask for more info when:
   - The request is too vague (e.g., "fix the bug" without specifying which bug)
   - You need to know which file/component/feature
   - Requirements are unclear
   - You need more context to help effectively

3. SPAWN_AGENT - Use terminal agent when:
   - Need to read/write files on user's machine
   - Need to run commands (tests, builds, git operations)
   - Need to analyze actual codebase (not just general questions)
   - Clear, actionable task with enough context

IMPORTANT OUTPUT FORMAT:
You must ALWAYS provide TWO versions of your response:
- glasses_display: MAX 100 characters. 1-2 short sentences for tiny AR glasses display. Be extremely concise.
- webview_content: Full detailed response with markdown formatting for web display.

When you've decided, output a JSON object with this exact structure:
{
  "decision": "direct_response" | "clarifying_question" | "spawn_agent",
  "glasses_display": "Short 1-2 sentence version for AR glasses (MAX 100 chars)",
  "webview_content": "Full detailed markdown response for web display",
  "goal": "Detailed goal for terminal agent (ONLY if decision is spawn_agent)",
  "reasoning": "Brief explanation of why you chose this action"
}

Remember:
- Be helpful and conversational
- If the user's daemon is offline and they need code work, tell them to start it
- Use tools to check context when helpful
- For spawn_agent, write a clear, detailed goal that Claude CLI can execute`;

/**
 * System prompt for synthesizing agent results
 */
const SYNTHESIS_SYSTEM_PROMPT = `You are a helpful AI assistant that summarizes the results of coding tasks.

A terminal agent has completed a task on the user's machine. Your job is to:
1. Summarize what was accomplished
2. Highlight key changes or findings
3. Note any issues or next steps

IMPORTANT OUTPUT FORMAT:
You must provide TWO versions:
- glasses_display: MAX 100 characters. Super concise status for AR glasses.
- webview_content: Full detailed markdown summary for web display.

Output a JSON object:
{
  "glasses_display": "Short status message (MAX 100 chars)",
  "webview_content": "# Full Report\\n\\n## Summary\\n..."
}`;

/**
 * MasterAgent - The intelligent query orchestrator
 */
export class MasterAgent {
  private client: Anthropic;
  private userId: string;
  private tools: MasterAgentTools;

  constructor(apiKey: string, userId: string) {
    this.client = new Anthropic({ apiKey });
    this.userId = userId;
    this.tools = createMasterAgentTools(userId);
  }

  /**
   * Process a query - main entry point
   * This is called in the background after a task is created
   */
  async processQuery(
    taskId: string,
    query: string,
    conversationId: string,
  ): Promise<void> {
    const startTime = Date.now();
    const db = getDb();

    // Update tools with conversation ID
    this.tools.setConversationId(conversationId);

    try {
      // Load conversation history
      const conversationService = getConversationService();
      const conversation =
        await conversationService.getConversation(conversationId);
      const history = conversation
        ? conversationService.getHistoryForPrompt(conversation)
        : "";

      console.log(`[MasterAgent] Processing query for task ${taskId}`);
      console.log(`[MasterAgent] Query: "${query}"`);
      console.log(
        `[MasterAgent] Conversation history: ${history ? "yes" : "none"}`,
      );

      // Step 1: Decide what to do (with tool use)
      const decision = await this.decideAction(query, history);
      console.log(`[MasterAgent] Decision: ${decision.type}`);

      // Handle based on decision type
      if (
        decision.type === "direct_response" ||
        decision.type === "clarifying_question"
      ) {
        // Fast path - no agent needed
        const result: TaskResult = {
          type: decision.type,
          glassesDisplay: decision.glassesDisplay || "Response ready.",
          webviewContent: decision.webviewContent || "No content.",
        };

        await this.completeTask(taskId, result, startTime, false);

        // Add assistant response to conversation
        await conversationService.addAssistantMessage(
          conversationId,
          decision.webviewContent || "",
          {
            glassesDisplay: decision.glassesDisplay,
            type: decision.type,
            taskId,
          },
        );
      } else if (decision.type === "spawn_agent") {
        // Slow path - spawn terminal agent
        const agentResult = await this.spawnAndWaitForAgent(
          decision.goal || query,
          decision.workingDirectory,
        );

        // Synthesize the result
        const synthesized = await this.synthesizeResult(query, agentResult);

        const result: TaskResult = {
          type: "agent_result",
          glassesDisplay: synthesized.glassesDisplay,
          webviewContent: synthesized.webviewContent,
          agentId: agentResult.agentId,
          agentResult: agentResult,
        };

        await this.completeTask(taskId, result, startTime, true);

        // Add assistant response to conversation
        await conversationService.addAssistantMessage(
          conversationId,
          synthesized.webviewContent,
          {
            glassesDisplay: synthesized.glassesDisplay,
            type: "agent_result",
            taskId,
            agentId: agentResult.agentId,
          },
        );
      }
    } catch (error) {
      console.error(`[MasterAgent] Error processing query:`, error);

      // Update task as failed
      await db.collection("tasks").updateOne(
        { taskId },
        {
          $set: {
            status: "failed",
            error: error instanceof Error ? error.message : String(error),
            processingTimeMs: Date.now() - startTime,
            updatedAt: new Date(),
            completedAt: new Date(),
          },
        },
      );
    }
  }

  /**
   * Decide what action to take based on the query
   * Uses Haiku 4.5 for fast decisions with tool support
   */
  private async decideAction(
    query: string,
    conversationHistory: string,
  ): Promise<MasterAgentDecision> {
    // Build the user message
    let userMessage = "";
    if (conversationHistory) {
      userMessage += `## Previous Conversation\n${conversationHistory}\n\n`;
    }
    userMessage += `## Current Query\nUser: "${query}"`;

    // Messages for the conversation
    const messages: Anthropic.Messages.MessageParam[] = [
      { role: "user", content: userMessage },
    ];

    // Tool use loop
    let iterations = 0;
    const maxIterations = 5;

    while (iterations < maxIterations) {
      iterations++;

      const response = await this.client.messages.create({
        model: MODELS.fast,
        max_tokens: 4096,
        system: DECISION_SYSTEM_PROMPT,
        tools: TOOL_DEFINITIONS as Anthropic.Messages.Tool[],
        messages,
      });

      // Check if Claude wants to use a tool
      const toolUseBlock = response.content.find(
        (
          block: Anthropic.Messages.ContentBlock,
        ): block is Anthropic.Messages.ToolUseBlock =>
          block.type === "tool_use",
      );

      if (toolUseBlock) {
        console.log(`[MasterAgent] Tool call: ${toolUseBlock.name}`);

        // Execute the tool
        const toolResult = await this.tools.executeTool(
          toolUseBlock.name,
          toolUseBlock.input as Record<string, any>,
        );

        // Add assistant message and tool result
        messages.push({ role: "assistant", content: response.content });
        messages.push({
          role: "user",
          content: [
            {
              type: "tool_result",
              tool_use_id: toolUseBlock.id,
              content: JSON.stringify(toolResult),
            },
          ],
        });

        // Continue loop
        continue;
      }

      // Claude is done - extract the decision
      const textBlock = response.content.find(
        (
          block: Anthropic.Messages.ContentBlock,
        ): block is Anthropic.Messages.TextBlock => block.type === "text",
      );

      if (textBlock) {
        return this.parseDecision(textBlock.text);
      }

      // No text block found
      break;
    }

    // Fallback if we couldn't get a decision
    return {
      type: "direct_response",
      glassesDisplay: "I couldn't process that request.",
      webviewContent:
        "I apologize, but I couldn't process your request. Please try again.",
      reasoning: "Failed to get a valid decision from the model",
    };
  }

  /**
   * Parse the decision JSON from Claude's response
   */
  private parseDecision(text: string): MasterAgentDecision {
    try {
      // Try to extract JSON from the response
      let jsonStr = text;

      // Handle markdown code blocks
      if (text.includes("```json")) {
        const match = text.match(/```json\s*([\s\S]*?)\s*```/);
        if (match) {
          jsonStr = match[1];
        }
      } else if (text.includes("```")) {
        const match = text.match(/```\s*([\s\S]*?)\s*```/);
        if (match) {
          jsonStr = match[1];
        }
      }

      // Try to find JSON object
      const jsonMatch = jsonStr.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        jsonStr = jsonMatch[0];
      }

      const parsed = JSON.parse(jsonStr);

      return {
        type: parsed.decision as DecisionType,
        glassesDisplay: parsed.glasses_display || parsed.glassesDisplay,
        webviewContent: parsed.webview_content || parsed.webviewContent,
        goal: parsed.goal,
        workingDirectory: parsed.working_directory || parsed.workingDirectory,
        reasoning: parsed.reasoning,
      };
    } catch (error) {
      console.error("[MasterAgent] Failed to parse decision:", error);
      console.error("[MasterAgent] Raw text:", text);

      // Return a fallback direct response
      return {
        type: "direct_response",
        glassesDisplay: "Processing your request.",
        webviewContent: text, // Use the raw text as content
        reasoning: "Failed to parse structured response",
      };
    }
  }

  /**
   * Spawn a terminal agent and wait for completion
   */
  private async spawnAndWaitForAgent(
    goal: string,
    workingDirectory?: string,
  ): Promise<{
    agentId: string;
    status: string;
    result?: string;
    error?: string;
    executionTimeMs: number;
  }> {
    const daemonManager = getDaemonManager();

    // Find user's daemon
    const daemon = daemonManager.getOnlineDaemonForUser(this.userId);
    if (!daemon) {
      throw new Error(
        `No daemon online for user ${this.userId}. Please start the daemon with 'bun run daemon'.`,
      );
    }

    console.log(`[MasterAgent] Spawning agent on daemon ${daemon.daemonId}`);
    console.log(`[MasterAgent] Goal: ${goal}`);

    // Spawn the agent
    const agentId = await daemonManager.spawnAgent(daemon.daemonId, {
      agentType: "terminal",
      goal,
      workingDirectory: workingDirectory || process.cwd(),
      sessionId: `master_${Date.now()}`,
    });

    if (!agentId) {
      throw new Error("Failed to spawn agent on daemon");
    }

    console.log(`[MasterAgent] Agent spawned: ${agentId}`);

    // Wait for completion (5 minute timeout)
    const result = await daemonManager.waitForCompletion(
      agentId,
      5 * 60 * 1000,
    );

    if (!result) {
      throw new Error("Agent timed out after 5 minutes");
    }

    return {
      agentId,
      status: result.status,
      result: result.result,
      error: result.error,
      executionTimeMs: result.executionTimeMs || 0,
    };
  }

  /**
   * Synthesize agent results into user-friendly format
   * Uses Sonnet 4.5 for quality synthesis
   */
  private async synthesizeResult(
    originalQuery: string,
    agentResult: {
      agentId: string;
      status: string;
      result?: string;
      error?: string;
      executionTimeMs: number;
    },
  ): Promise<{ glassesDisplay: string; webviewContent: string }> {
    const userMessage = `Original user query: "${originalQuery}"

Agent execution result:
- Agent ID: ${agentResult.agentId}
- Status: ${agentResult.status}
- Execution time: ${Math.round(agentResult.executionTimeMs / 1000)}s
${agentResult.error ? `- Error: ${agentResult.error}` : ""}
${agentResult.result ? `- Result:\n${agentResult.result}` : ""}

Please summarize this for the user.`;

    try {
      const response = await this.client.messages.create({
        model: MODELS.smart,
        max_tokens: 4096,
        system: SYNTHESIS_SYSTEM_PROMPT,
        messages: [{ role: "user", content: userMessage }],
      });

      const textBlock = response.content.find(
        (
          block: Anthropic.Messages.ContentBlock,
        ): block is Anthropic.Messages.TextBlock => block.type === "text",
      );

      if (textBlock) {
        return this.parseSynthesis(textBlock.text, agentResult);
      }
    } catch (error) {
      console.error("[MasterAgent] Error synthesizing result:", error);
    }

    // Fallback synthesis
    return this.fallbackSynthesis(agentResult);
  }

  /**
   * Parse the synthesis JSON from Claude's response
   */
  private parseSynthesis(
    text: string,
    agentResult: { status: string; error?: string },
  ): { glassesDisplay: string; webviewContent: string } {
    try {
      let jsonStr = text;

      // Handle markdown code blocks
      if (text.includes("```json")) {
        const match = text.match(/```json\s*([\s\S]*?)\s*```/);
        if (match) {
          jsonStr = match[1];
        }
      } else if (text.includes("```")) {
        const match = text.match(/```\s*([\s\S]*?)\s*```/);
        if (match) {
          jsonStr = match[1];
        }
      }

      // Try to find JSON object
      const jsonMatch = jsonStr.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        jsonStr = jsonMatch[0];
      }

      const parsed = JSON.parse(jsonStr);

      return {
        glassesDisplay: (
          parsed.glasses_display ||
          parsed.glassesDisplay ||
          "Task completed."
        ).substring(0, 100),
        webviewContent: parsed.webview_content || parsed.webviewContent || text,
      };
    } catch (error) {
      console.error("[MasterAgent] Failed to parse synthesis:", error);
      return this.fallbackSynthesis(agentResult);
    }
  }

  /**
   * Fallback synthesis when parsing fails
   */
  private fallbackSynthesis(agentResult: {
    status: string;
    result?: string;
    error?: string;
  }): { glassesDisplay: string; webviewContent: string } {
    if (agentResult.status === "completed") {
      return {
        glassesDisplay: "Task completed successfully.",
        webviewContent: `# Task Completed\n\n${agentResult.result || "The task was completed."}`,
      };
    } else {
      return {
        glassesDisplay: `Task ${agentResult.status}.`,
        webviewContent: `# Task ${agentResult.status}\n\n${agentResult.error || "The task did not complete successfully."}`,
      };
    }
  }

  /**
   * Complete a task and update MongoDB
   */
  private async completeTask(
    taskId: string,
    result: TaskResult,
    startTime: number,
    agentSpawned: boolean,
  ): Promise<void> {
    if (!isConnected()) {
      console.error(
        "[MasterAgent] MongoDB not connected, cannot complete task",
      );
      return;
    }

    const db = getDb();
    await db.collection("tasks").updateOne(
      { taskId },
      {
        $set: {
          status: "completed",
          result,
          agentSpawned,
          processingTimeMs: Date.now() - startTime,
          updatedAt: new Date(),
          completedAt: new Date(),
        },
      },
    );

    console.log(
      `[MasterAgent] Task ${taskId} completed in ${Date.now() - startTime}ms`,
    );
  }
}

// =============================================================================
// Factory Functions
// =============================================================================

// Cache of MasterAgent instances per user
const agentCache = new Map<string, MasterAgent>();

/**
 * Get or create a MasterAgent for a user
 */
export function getMasterAgent(userId: string): MasterAgent {
  let agent = agentCache.get(userId);
  if (!agent) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new Error("ANTHROPIC_API_KEY environment variable not set");
    }
    agent = new MasterAgent(apiKey, userId);
    agentCache.set(userId, agent);
  }
  return agent;
}

/**
 * Create a new MasterAgent instance (for testing)
 */
export function createMasterAgent(apiKey: string, userId: string): MasterAgent {
  return new MasterAgent(apiKey, userId);
}

/**
 * Clear the agent cache (for testing)
 */
export function clearMasterAgentCache(): void {
  agentCache.clear();
}
