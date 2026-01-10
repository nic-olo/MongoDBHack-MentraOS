/** Options for running Claude Code */
export interface ClaudeOptions {
    cwd?: string;
    outputFormat?: "text" | "json" | "stream-json";
}

/** Response from Claude Code */
export interface ClaudeResponse {
    result: string;
    is_error?: boolean;
}

/**
 * Run Claude Code CLI with the given prompt
 * Uses -p flag for non-interactive mode with JSON output
 */
export async function runClaudeCode(
    prompt: string,
    options: ClaudeOptions = {}
): Promise<ClaudeResponse> {
    const { cwd = process.cwd(), outputFormat = "json" } = options;

    const args = ["/usr/local/bin/claude", "-p", prompt, "--output-format", outputFormat];

    console.log(`[claude] Running job: "${prompt.slice(0, 50)}..."`);

    const proc = Bun.spawn(args, {
        cwd,
        stdout: "pipe",
        stderr: "pipe",
    });

    const stdout = await new Response(proc.stdout).text();
    const stderr = await new Response(proc.stderr).text();
    const exitCode = await proc.exited;

    if (stderr && !stdout) {
        console.error(`[claude] stderr: ${stderr}`);
    }

    if (exitCode !== 0 && !stdout) {
        return {
            result: stderr || "Claude Code failed with no output",
            is_error: true,
        };
    }

    // Parse JSON response if using json format
    if (outputFormat === "json") {
        try {
            const parsed = JSON.parse(stdout);
            return { result: parsed.result || stdout };
        } catch {
            return { result: stdout.trim() };
        }
    }

    return { result: stdout.trim() };
}
