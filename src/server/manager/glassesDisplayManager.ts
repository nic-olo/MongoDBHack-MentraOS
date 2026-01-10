/**
 * =============================================================================
 * Glasses Display Manager - Real-time Status Display for MentraOS Glasses
 * =============================================================================
 *
 * This module manages what's displayed on the MentraOS glasses in real-time.
 * It shows:
 * - System status
 * - Voice commands being processed
 * - Master Agent activity
 * - Responses and results
 *
 * =============================================================================
 */

import { AppSession } from "@mentra/sdk";

export interface DisplayMessage {
  type: 'status' | 'command' | 'processing' | 'response' | 'error';
  title?: string;
  message: string;
  timestamp: Date;
}

export class GlassesDisplayManager {
  private session: AppSession;
  private userId: string;
  private logger: Console | any;
  private currentDisplay: DisplayMessage | null = null;
  private displayHistory: DisplayMessage[] = [];
  private maxHistorySize: number = 50;

  constructor(session: AppSession, userId: string, logger?: Console | any) {
    this.session = session;
    this.userId = userId;
    this.logger = logger || console;
  }

  /**
   * Display a status message (e.g., "Listening...", "Ready", "Connected")
   */
  async showStatus(message: string): Promise<void> {
    const displayMsg: DisplayMessage = {
      type: 'status',
      title: '📊 Status',
      message,
      timestamp: new Date()
    };

    await this.displayMessage(displayMsg);
  }

  /**
   * Display a captured voice command
   */
  async showCommand(command: string): Promise<void> {
    const displayMsg: DisplayMessage = {
      type: 'command',
      title: '🎙️ Command',
      message: command,
      timestamp: new Date()
    };

    await this.displayMessage(displayMsg);
  }

  /**
   * Display processing status (e.g., "Thinking...", "Analyzing code...")
   */
  async showProcessing(message: string): Promise<void> {
    const displayMsg: DisplayMessage = {
      type: 'processing',
      title: '⚙️ Processing',
      message,
      timestamp: new Date()
    };

    await this.displayMessage(displayMsg);
  }

  /**
   * Display a response from the Master Agent
   */
  async showResponse(response: string): Promise<void> {
    const displayMsg: DisplayMessage = {
      type: 'response',
      title: '💬 Response',
      message: response,
      timestamp: new Date()
    };

    await this.displayMessage(displayMsg);
  }

  /**
   * Display an error message
   */
  async showError(error: string): Promise<void> {
    const displayMsg: DisplayMessage = {
      type: 'error',
      title: '❌ Error',
      message: error,
      timestamp: new Date()
    };

    await this.displayMessage(displayMsg);
  }

  /**
   * Display wake word detection
   */
  async showWakeWord(): Promise<void> {
    const displayMsg: DisplayMessage = {
      type: 'status',
      title: '🎙️ Wake Word',
      message: 'Listening for your command...',
      timestamp: new Date()
    };

    await this.displayMessage(displayMsg);
  }

  /**
   * Show that Master Agent is working with sub-agents
   */
  async showAgentActivity(agentType: string, activity: string): Promise<void> {
    const displayMsg: DisplayMessage = {
      type: 'processing',
      title: `🤖 ${agentType}`,
      message: activity,
      timestamp: new Date()
    };

    await this.displayMessage(displayMsg);
  }

  /**
   * Show polling progress
   */
  async showPollingStatus(attempt: number, maxAttempts: number): Promise<void> {
    const progress = Math.round((attempt / maxAttempts) * 100);
    const displayMsg: DisplayMessage = {
      type: 'processing',
      title: '🔄 Processing',
      message: `Analyzing your request... ${progress}%`,
      timestamp: new Date()
    };

    await this.displayMessage(displayMsg);
  }

  /**
   * Core display function - sends text to glasses
   */
  private async displayMessage(msg: DisplayMessage): Promise<void> {
    this.currentDisplay = msg;
    this.addToHistory(msg);

    // Format the message for glasses display
    const formattedText = this.formatForGlasses(msg);

    try {
      // Check if session and layouts exist
      if (!this.session || !this.session.layouts) {
        this.logger.error(`[Glasses Display] Session or layouts not available`);
        return;
      }

      // Display on glasses using the layouts API (TextWall for simple text)
      this.session.layouts.showTextWall(formattedText);

      this.logger.info(`[Glasses Display] ✅ Showed: ${msg.message}`);
    } catch (error) {
      this.logger.error(`[Glasses Display] ❌ Failed to display message. Error:`, error);
      this.logger.error(`[Glasses Display] Attempted text:`, formattedText);
      this.logger.error(`[Glasses Display] Message type:`, msg.type);
    }
  }

  /**
   * Format message for optimal glasses display
   */
  private formatForGlasses(msg: DisplayMessage): string {
    // Create a clean, readable format for glasses
    // Keep it simple - just show the message for now
    return msg.message || '';
  }

  /**
   * Add message to history
   */
  private addToHistory(msg: DisplayMessage): void {
    this.displayHistory.push(msg);

    // Keep history size manageable
    if (this.displayHistory.length > this.maxHistorySize) {
      this.displayHistory.shift();
    }
  }

  /**
   * Get current display
   */
  getCurrentDisplay(): DisplayMessage | null {
    return this.currentDisplay;
  }

  /**
   * Get display history
   */
  getHistory(): DisplayMessage[] {
    return [...this.displayHistory];
  }

  /**
   * Clear the display
   */
  async clear(): Promise<void> {
    try {
      // Clear by showing empty text
      this.session.layouts.showTextWall('');
      this.currentDisplay = null;
    } catch (error) {
      this.logger.error(`[Glasses Display] Failed to clear display:`, error);
    }
  }

  /**
   * Show a temporary message that auto-clears after a duration
   */
  async showTemporary(message: string, durationMs: number = 3000): Promise<void> {
    await this.showStatus(message);

    setTimeout(async () => {
      await this.clear();
    }, durationMs);
  }
}

/**
 * Factory function to create a glasses display manager
 */
export function createGlassesDisplayManager(
  session: AppSession,
  userId: string,
  logger?: Console | any
): GlassesDisplayManager {
  return new GlassesDisplayManager(session, userId, logger);
}
