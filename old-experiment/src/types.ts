/** Job status */
export type JobStatus = "pending" | "running" | "done" | "error";

/** Agent Scratchpad - observable state for the user */
export interface Scratchpad {
    goal: string;
    status: "idle" | "thinking" | "working" | "complete" | "error";
    currentStep?: string;
    progress?: { done: number; total: number };
    notes: string[];
    checklist?: { label: string; done: boolean }[];
    lastUpdated: number;
}

/** A single job/sub-agent */
export interface Job {
    id: string;
    prompt: string;
    status: JobStatus;
    output: string;
    error?: string;
    createdAt: number;
    startedAt?: number;
    completedAt?: number;
}

/** Event broadcast to all SSE clients */
export interface JobEvent {
    type: "job_created" | "job_started" | "job_output" | "job_done" | "job_error";
    jobId: string;
    data: string;
    timestamp: number;
}

/** Scratchpad update event */
export interface ScratchpadEvent {
    type: "scratchpad_update";
    terminalId: string;
    scratchpad: Scratchpad;
}

/** Message in chat history */
export interface ChatMessage {
    id: string;
    role: "user" | "assistant";
    content: string;
    jobId?: string;
    timestamp: number;
}
