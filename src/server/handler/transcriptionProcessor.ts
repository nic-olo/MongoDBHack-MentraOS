/**
 * =============================================================================
 * Transcription Processor - Wake Word Detection
 * =============================================================================
 *
 * This module handles wake word detection in transcription streams.
 * It listens for wake words like "hey SOGA" and triggers the processing state.
 *
 * FLOW:
 * 1. Monitor transcription for wake words
 * 2. When detected, log detection and set flag
 * 3. Wait for silence period (3-5 seconds of no audio)
 * 4. Set "ready to process" state
 *
 * =============================================================================
 */

import { WAKE_WORDS, SILENCE_THRESHOLD_MS } from "../const/wakeWords";

interface TranscriptionProcessorOptions {
  wakeWords?: string[];
  silenceThresholdMs?: number;
  onWakeWordDetected?: () => void;
  onReadyToProcess?: (transcription: string) => void;
  logger?: Console | any;
}

export class TranscriptionProcessor {
  private wakeWords: string[];
  private silenceThresholdMs: number;
  private onWakeWordDetected?: () => void;
  private onReadyToProcess?: (transcription: string) => void;
  private logger: Console | any;

  private isWakeWordDetected: boolean = false;
  private lastTranscriptionTime: number = 0;
  private silenceCheckInterval: NodeJS.Timeout | null = null;
  private accumulatedTranscription: string = "";

  constructor(options: TranscriptionProcessorOptions = {}) {
    // Use wake words from constants file or allow override
    this.wakeWords = options.wakeWords || [...WAKE_WORDS];

    // Use silence threshold from constants file or allow override
    this.silenceThresholdMs = options.silenceThresholdMs || SILENCE_THRESHOLD_MS;
    this.onWakeWordDetected = options.onWakeWordDetected;
    this.onReadyToProcess = options.onReadyToProcess;
    this.logger = options.logger || console;
  }

  /**
   * Clean transcription text: lowercase, remove punctuation, keep only letters and spaces
   */
  private cleanTranscription(text: string): string {
    return text
      .toLowerCase()
      .replace(/[^a-z\s]/g, '') // Remove everything except letters and spaces
      .replace(/\s+/g, ' ')     // Replace multiple spaces with single space
      .trim();
  }

  /**
   * Process incoming transcription text
   * @param transcriptionText - The transcription text to process
   * @param isFinal - Whether this is a final or partial transcription
   */
  public processTranscription(transcriptionText: string, isFinal: boolean): void {
    if (!transcriptionText || transcriptionText.trim().length === 0) {
      return;
    }

    this.lastTranscriptionTime = Date.now();

    // Clean the transcription text
    const cleanedText = this.cleanTranscription(transcriptionText);

    if (!cleanedText) {
      return;
    }

    // Check for wake word if not already detected
    if (!this.isWakeWordDetected) {
      const detected = this.detectWakeWord(cleanedText);

      if (detected) {
        this.isWakeWordDetected = true;
        this.accumulatedTranscription = "";
        this.logger.info("🎙️  Wake word detected! Listening for command...");

        if (this.onWakeWordDetected) {
          this.onWakeWordDetected();
        }

        // Start monitoring for silence
        this.startSilenceMonitoring();
      }
    } else {
      // Wake word already detected, accumulate transcription
      if (isFinal) {
        // Remove wake word from beginning if present
        const commandText = this.removeWakeWord(cleanedText);
        this.accumulatedTranscription += (this.accumulatedTranscription ? " " : "") + commandText;
        this.logger.info(`📝 Accumulated: "${this.accumulatedTranscription}"`);
      }
    }
  }

  /**
   * Detect if the transcription contains a wake word
   * Note: text should already be cleaned (lowercase, no punctuation)
   */
  private detectWakeWord(text: string): boolean {
    for (const wakeWord of this.wakeWords) {
      if (text.includes(wakeWord)) {
        this.logger.info(`✅ Wake word match: "${wakeWord}" in "${text}"`);
        return true;
      }
    }

    return false;
  }

  /**
   * Remove wake word from the beginning of transcription
   * Note: text should already be cleaned (lowercase, no punctuation)
   */
  private removeWakeWord(text: string): string {
    let result = text;

    // Try to remove wake word from the start
    for (const wakeWord of this.wakeWords) {
      if (result.startsWith(wakeWord)) {
        result = result.substring(wakeWord.length).trim();
        break;
      }
    }

    // Also try to remove wake word from anywhere in the text
    // This handles cases like "hey ai what time is it" -> "what time is it"
    for (const wakeWord of this.wakeWords) {
      const wakeWordIndex = result.indexOf(wakeWord);
      if (wakeWordIndex !== -1) {
        // Remove the wake word and everything before it
        result = result.substring(wakeWordIndex + wakeWord.length).trim();
        break;
      }
    }

    return result;
  }

  /**
   * Start monitoring for silence (no transcription activity)
   */
  private startSilenceMonitoring(): void {
    // Clear any existing interval
    if (this.silenceCheckInterval) {
      clearInterval(this.silenceCheckInterval);
    }

    // Check for silence every 500ms
    this.silenceCheckInterval = setInterval(() => {
      const timeSinceLastTranscription = Date.now() - this.lastTranscriptionTime;

      if (timeSinceLastTranscription >= this.silenceThresholdMs) {
        this.logger.info("🔇 Silence detected - ready to process");
        this.handleReadyToProcess();
      }
    }, 500);
  }

  /**
   * Handle the ready-to-process state
   */
  private handleReadyToProcess(): void {
    // Stop monitoring
    if (this.silenceCheckInterval) {
      clearInterval(this.silenceCheckInterval);
      this.silenceCheckInterval = null;
    }

    const finalTranscription = this.accumulatedTranscription.trim();

    if (finalTranscription.length > 0) {
      this.logger.info(`✅ Ready to process: "${finalTranscription}"`);

      if (this.onReadyToProcess) {
        this.onReadyToProcess(finalTranscription);
      }
    } else {
      this.logger.info("⚠️  No command captured after wake word");

      // Call the callback with empty string to signal no command
      if (this.onReadyToProcess) {
        this.onReadyToProcess('');
      }
    }

    // Reset state
    this.reset();
  }

  /**
   * Check if wake word has been detected and we're listening for commands
   */
  public isWakeWordActive(): boolean {
    return this.isWakeWordDetected;
  }

  /**
   * Reset the processor state
   */
  public reset(): void {
    this.isWakeWordDetected = false;
    this.accumulatedTranscription = "";
    this.lastTranscriptionTime = 0;

    if (this.silenceCheckInterval) {
      clearInterval(this.silenceCheckInterval);
      this.silenceCheckInterval = null;
    }
  }

  /**
   * Clean up resources
   */
  public destroy(): void {
    this.reset();
  }
}

/**
 * Factory function to create a transcription processor
 */
export function createTranscriptionProcessor(
  options: TranscriptionProcessorOptions = {}
): TranscriptionProcessor {
  return new TranscriptionProcessor(options);
}
