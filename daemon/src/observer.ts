/**
 * LLM Observer
 * Uses a fast LLM (Claude Haiku) to intelligently observe terminal state
 * Instead of brittle regex matching, we use AI to understand what's happening
 */

import Anthropic from "@anthropic-ai/sdk";
import type { TerminalObservation, TerminalState } from "./types";

// Initialize Anthropic client (uses ANTHROPIC_API_KEY env var automatically)
const anthropic = new Anthropic();

const SYSTEM_PROMPT = `You are observing a terminal running Claude Code CLI. Your job is to analyze the terminal output and determine the current state.

Analyze the terminal buffer and respond with ONLY a JSON object (no markdown, no explanation):

{
  "state": "initializing" | "ready" | "working" | "needs_approval" | "completed" | "error",
  "confidence": 0.0-1.0,
  "action": "wait" | "send_approval" | "send_rejection" | "report_complete" | "report_error",
  "summary": "brief description of what's happening",
  "error": "error message if state is error, otherwise null"
}

STATE DEFINITIONS:
- "initializing": Claude CLI is starting up, loading, showing welcome message
- "ready": Claude is showing an input prompt, waiting for user to type a command (look for ">" or "❯" prompt at end)
- "working": Claude is actively processing - you'll see thinking indicators, file operations, code being written, tool calls happening
- "needs_approval": Claude is asking for permission. Look for patterns like:
  - "Allow" / "allow"
  - "(y/n)" or "[y/n]" or "y/n"
  - "permission"
  - "approve"
  - "Do you want to"
  - "Would you like"
  - Bash command confirmations
- "completed": Claude finished the task and returned to idle prompt. The work is done and it's waiting for new input.
- "error": Something went wrong - crash, timeout, error messages

ACTION RULES:
- "wait": Keep monitoring, don't intervene
- "send_approval": Send "y" to approve (only when state is needs_approval)
- "send_rejection": Send "n" to reject (rarely used)
- "report_complete": Task is done, report results back
- "report_error": Something failed, report error

IMPORTANT PATTERNS:
- If you see a prompt character (>, ❯) at the END of output with no activity = likely "ready" or "completed"
- If there's a (y/n) or permission question = "needs_approval"
- If you see "Thinking...", "Reading...", "Writing...", "Running..." = "working"
- If the terminal just has initialization text and a prompt = "ready" (waiting for goal)
- If the goal was submitted and now there's a prompt = "completed"

Remember: Output ONLY the JSON object, nothing else.`;

/**
 * Observe terminal state using Claude Haiku
 */
export async function observeTerminal(
  buffer: string,
  goal: string,
  goalSubmitted: boolean
): Promise<TerminalObservation> {
  try {
    const prompt = `CONTEXT:
- User's goal: "${goal}"
- Goal has been submitted to Claude: ${goalSubmitted ? "YES" : "NO (still waiting to send)"}

TERMINAL BUFFER (last 3000 characters):
\`\`\`
${buffer.slice(-3000)}
\`\`\`

Analyze the terminal state and respond with JSON only.`;

    const response = await anthropic.messages.create({
      model: "claude-3-5-haiku-20241022",
      max_tokens: 256,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: prompt,
        },
      ],
    });

    // Extract text from response
    const textContent = response.content.find((c) => c.type === "text");
    if (!textContent || textContent.type !== "text") {
      throw new Error("No text content in response");
    }

    const responseText = textContent.text.trim();

    // Parse JSON response
    let parsed: TerminalObservation;
    try {
      // Handle potential markdown wrapping
      let jsonStr = responseText;
      if (jsonStr.startsWith("```")) {
        jsonStr = jsonStr.replace(/```json?\n?/g, "").replace(/```/g, "");
      }
      parsed = JSON.parse(jsonStr.trim());
    } catch (parseError) {
      console.error("[observer] Failed to parse LLM response:", responseText);
      // Return a safe default
      return {
        state: "working",
        confidence: 0.3,
        action: "wait",
        summary: "Unable to parse observer response, continuing to wait",
      };
    }

    // Validate the response
    if (!isValidObservation(parsed)) {
      console.error("[observer] Invalid observation structure:", parsed);
      return {
        state: "working",
        confidence: 0.3,
        action: "wait",
        summary: "Invalid observation structure, continuing to wait",
      };
    }

    return parsed;
  } catch (error) {
    console.error("[observer] LLM call failed:", error);
    // On error, return a safe default that keeps monitoring
    return {
      state: "working",
      confidence: 0.1,
      action: "wait",
      summary: `Observer error: ${error instanceof Error ? error.message : "Unknown error"}`,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * Validate that an observation has the required fields
 */
function isValidObservation(obj: any): obj is TerminalObservation {
  const validStates: TerminalState[] = [
    "initializing",
    "ready",
    "working",
    "needs_approval",
    "completed",
    "error",
  ];
  const validActions = [
    "wait",
    "send_approval",
    "send_rejection",
    "report_complete",
    "report_error",
  ];

  return (
    typeof obj === "object" &&
    obj !== null &&
    validStates.includes(obj.state) &&
    typeof obj.confidence === "number" &&
    obj.confidence >= 0 &&
    obj.confidence <= 1 &&
    validActions.includes(obj.action)
  );
}

/**
 * Quick heuristic check (no LLM call) for obvious states
 * Use this to reduce LLM calls when state is obvious
 */
export function quickCheck(buffer: string): {
  obviousState: TerminalState | null;
  shouldCallLLM: boolean;
} {
  const lastChars = buffer.slice(-500);
  const cleanBuffer = lastChars.replace(/\u001b\[[0-9;]*[a-zA-Z]/g, ""); // Strip ANSI codes

  // Obvious approval needed
  if (
    /\(y\/n\)/i.test(cleanBuffer) ||
    /\[y\/n\]/i.test(cleanBuffer) ||
    /allow.*\?/i.test(cleanBuffer) ||
    /permission/i.test(cleanBuffer)
  ) {
    return { obviousState: "needs_approval", shouldCallLLM: false };
  }

  // Obvious error
  if (
    /error:/i.test(cleanBuffer) ||
    /fatal:/i.test(cleanBuffer) ||
    /crash/i.test(cleanBuffer) ||
    /ENOENT/i.test(cleanBuffer)
  ) {
    return { obviousState: null, shouldCallLLM: true }; // Let LLM decide severity
  }

  // Otherwise, call LLM
  return { obviousState: null, shouldCallLLM: true };
}

/**
 * Observer class for managing observation state
 */
export class TerminalObserver {
  private lastObservation: TerminalObservation | null = null;
  private observationCount = 0;
  private goal: string;
  private goalSubmitted: boolean = false;

  constructor(goal: string) {
    this.goal = goal;
  }

  /**
   * Mark that the goal has been submitted to Claude
   */
  markGoalSubmitted(): void {
    this.goalSubmitted = true;
  }

  /**
   * Observe the terminal and return recommended action
   */
  async observe(buffer: string): Promise<TerminalObservation> {
    this.observationCount++;

    // Quick heuristic check first
    const quick = quickCheck(buffer);
    if (quick.obviousState === "needs_approval") {
      const obs: TerminalObservation = {
        state: "needs_approval",
        confidence: 0.9,
        action: "send_approval",
        summary: "Detected approval prompt (heuristic)",
      };
      this.lastObservation = obs;
      return obs;
    }

    // Call LLM for non-obvious states
    const observation = await observeTerminal(buffer, this.goal, this.goalSubmitted);
    this.lastObservation = observation;

    console.log(
      `[observer] #${this.observationCount} state=${observation.state} action=${observation.action} confidence=${observation.confidence}`
    );

    return observation;
  }

  /**
   * Get the last observation
   */
  getLastObservation(): TerminalObservation | null {
    return this.lastObservation;
  }

  /**
   * Get observation count
   */
  getObservationCount(): number {
    return this.observationCount;
  }
}
