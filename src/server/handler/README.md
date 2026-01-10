# Transcription Processor

This module handles wake word detection in transcription streams for the SOGA voice assistant.

## How It Works

1. **Wake Word Detection**: Monitors incoming transcription for wake words like "hey SOGA"
2. **Command Capture**: Once detected, starts capturing the user's command
3. **Silence Detection**: Waits for 3 seconds of silence (no new transcription)
4. **Ready to Process**: Triggers the `onReadyToProcess` callback with the captured command

## Usage

```typescript
import { createTranscriptionProcessor } from './handler/transcriptionProcessor';

// Create a processor instance
const processor = createTranscriptionProcessor({
  wakeWords: ["hey soga", "hey saga", "hi soga"],
  silenceThresholdMs: 3000, // 3 seconds
  onWakeWordDetected: () => {
    console.log("Wake word detected!");
  },
  onReadyToProcess: (command) => {
    console.log("Process command:", command);
    // Add your command processing logic here
  },
  logger: console
});

// Feed transcription to the processor
processor.processTranscription("hey soga turn on the lights", true);

// Clean up when done
processor.destroy();
```

## Configuration Options

- `wakeWords`: Array of wake word phrases to detect (case-insensitive)
- `silenceThresholdMs`: Milliseconds of silence before processing (default: 3000)
- `onWakeWordDetected`: Callback when wake word is detected
- `onReadyToProcess`: Callback when command is ready (receives the command text)
- `logger`: Logger instance for debugging

## Wake Words

The default wake words include variations to handle speech-to-text inaccuracies:
- "hey soga"
- "hey saga"
- "hi soga"
- "hey soha"
- "soga"
- "hey so go"

## Example Flow

```
User says: "Hey SOGA, what's the weather today?"

1. Transcription: "hey soga"
   → Wake word detected ✅
   → Start listening for command

2. Transcription: "what's the weather today"
   → Accumulate text

3. [3 seconds of silence]
   → Ready to process: "what's the weather today"
   → Trigger onReadyToProcess callback
```

## Integration

The processor is integrated into the main app at [src/server/index.ts:139-185](../index.ts#L139-L185):

- Creates a processor for each user session
- Feeds all transcription (final and partial) to the processor
- Cleans up when the session ends

## Next Steps

Add your command processing logic in the `onReadyToProcess` callback:
- Send to AI/LLM service
- Execute device commands
- Trigger app actions
- etc.
