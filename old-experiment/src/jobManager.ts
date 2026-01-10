import type { Job, JobStatus, JobEvent } from "./types";
import { runClaudeCode } from "./claude";

type EventCallback = (event: JobEvent) => void;

/**
 * JobManager - handles concurrent sub-agents
 * Each job runs independently with its own Claude Code session
 */
class JobManagerClass {
    private jobs: Map<string, Job> = new Map();
    private listeners: Set<EventCallback> = new Set();

    /** Generate unique job ID */
    private generateId(): string {
        return `job_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    }

    /** Subscribe to all job events (for SSE) */
    subscribe(callback: EventCallback): () => void {
        this.listeners.add(callback);
        return () => this.listeners.delete(callback);
    }

    /** Broadcast event to all listeners */
    private emit(event: Omit<JobEvent, "timestamp">) {
        const fullEvent: JobEvent = { ...event, timestamp: Date.now() };
        for (const listener of this.listeners) {
            try {
                listener(fullEvent);
            } catch (e) {
                console.error("Event listener error:", e);
            }
        }
    }

    /** Create a new job - returns immediately (non-blocking) */
    createJob(prompt: string, cwd: string = process.cwd()): Job {
        const id = this.generateId();

        const job: Job = {
            id,
            prompt,
            status: "pending",
            output: "",
            createdAt: Date.now(),
        };

        this.jobs.set(id, job);
        this.emit({ type: "job_created", jobId: id, data: prompt });

        // Start job execution async (non-blocking)
        this.executeJob(id, cwd);

        return job;
    }

    /** Execute job in background */
    private async executeJob(jobId: string, cwd: string) {
        const job = this.jobs.get(jobId);
        if (!job) return;

        // Update status to running
        job.status = "running";
        job.startedAt = Date.now();
        this.emit({ type: "job_started", jobId, data: "" });

        try {
            const response = await runClaudeCode(job.prompt, { cwd });

            if (response.is_error) {
                job.status = "error";
                job.error = response.result;
                job.completedAt = Date.now();
                this.emit({ type: "job_error", jobId, data: response.result });
            } else {
                job.output = response.result;
                job.status = "done";
                job.completedAt = Date.now();
                this.emit({ type: "job_output", jobId, data: response.result });
                this.emit({ type: "job_done", jobId, data: "" });
            }
        } catch (error) {
            const errorMsg = error instanceof Error ? error.message : String(error);
            job.status = "error";
            job.error = errorMsg;
            job.completedAt = Date.now();
            this.emit({ type: "job_error", jobId, data: errorMsg });
        }
    }

    /** Get a single job */
    getJob(id: string): Job | undefined {
        return this.jobs.get(id);
    }

    /** Get all jobs */
    getAllJobs(): Job[] {
        return Array.from(this.jobs.values()).sort((a, b) => a.createdAt - b.createdAt);
    }

    /** Get running jobs count */
    getRunningCount(): number {
        return Array.from(this.jobs.values()).filter(j => j.status === "running").length;
    }

    /** Clear all completed jobs */
    clearCompleted() {
        for (const [id, job] of this.jobs) {
            if (job.status === "done" || job.status === "error") {
                this.jobs.delete(id);
            }
        }
    }

    /** Clear all jobs */
    clearAll() {
        this.jobs.clear();
    }
}

// Singleton instance
export const jobManager = new JobManagerClass();
