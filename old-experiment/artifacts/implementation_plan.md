# Implementation Plan - Terminal UI and Stability Improvements

The goal is to fix the missing auto-scroll in the terminal and address the "proxy / request time out" errors mentioned by the user.

## Proposed Changes

### 1. Frontend: Auto-Scroll Terminal
In `public/index.html`, we need to change how we handle terminal output.
- Use `term.write(data, () => term.scrollToBottom())` or simply call `term.scrollToBottom()` whenever new data arrives.
- Ensure the terminal "sticks" to the bottom if the user hasn't manually scrolled up.

### 2. Backend: Stability Improvements
In `src/terminalAgent.ts` and `src/terminal.ts`:
- Add better logging for WebSocket connection drops.
- Ensure the `monitorClaudeWork` loop is resilient to short connection interruptions.
- The user mentioned "proxy / request time out". This might be related to the SSE endpoint or the Bun server handling too many simultaneous PTY reads. I will check the dev server logs.

## Verification Plan
1. Start the agent with a long goal.
2. Verify that the terminal scrolls automatically as output flows in.
3. Check the server console for any explicit timeout errors during the run.
