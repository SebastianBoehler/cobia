import { z } from "zod";

const JobStateEntrySchema = z.object({
  revision: z.number().int().positive().optional(),
  state: z.string(),
  attempts: z.number().int().nonnegative().default(0),
  retryAfterMs: z.number().int().nonnegative().optional(),
}).strict();

export const SolverJobStateSchema = z.record(z.string().uuid(), JobStateEntrySchema);
export type SolverJobState = z.infer<typeof SolverJobStateSchema>;

export class IntentAttempts {
  constructor(private readonly state: SolverJobState, private readonly options: {
    maxAttempts: number;
    retryBaseMs: number;
  }) {
    if (!Number.isSafeInteger(options.maxAttempts) || options.maxAttempts < 1 ||
        !Number.isSafeInteger(options.retryBaseMs) || options.retryBaseMs < 1) {
      throw new Error("Intent retry controls must be positive integers");
    }
  }

  isHandled(intentId: string, nowMs = Date.now()) {
    const entry = this.state[intentId];
    if (!entry) return false;
    if (entry.state !== "error") return true;
    return entry.attempts >= this.options.maxAttempts || (entry.retryAfterMs ?? 0) > nowMs;
  }

  failed(intentId: string, nowMs = Date.now()) {
    const attempts = (this.state[intentId]?.attempts ?? 0) + 1;
    const retryAfterMs = nowMs + this.options.retryBaseMs * (2 ** (attempts - 1));
    const entry = { state: "error", attempts, retryAfterMs };
    this.state[intentId] = entry;
    return entry;
  }

  stop(intentId: string, state = "expired") {
    const entry = this.state[intentId];
    this.state[intentId] = {
      state,
      attempts: entry?.attempts ?? 0,
    };
  }

  completed(intentId: string, revision: number, state: string) {
    this.state[intentId] = {
      revision,
      state,
      attempts: this.state[intentId]?.attempts ?? 0,
    };
  }
}

export class WorkLimiter {
  private active = 0;
  private readonly waiting: Array<() => void> = [];

  constructor(private readonly maximum: number) {
    if (!Number.isSafeInteger(maximum) || maximum < 1) {
      throw new Error("Solver concurrency must be a positive integer");
    }
  }

  async run<T>(work: () => Promise<T>): Promise<T> {
    if (this.active >= this.maximum) {
      await new Promise<void>((resolve) => this.waiting.push(resolve));
    }
    this.active += 1;
    try { return await work(); }
    finally {
      this.active -= 1;
      this.waiting.shift()?.();
    }
  }
}
