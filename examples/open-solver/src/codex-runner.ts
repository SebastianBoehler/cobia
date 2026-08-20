import {
  Codex,
  type ModelReasoningEffort,
  type ThreadEvent,
  type ThreadOptions,
} from "@openai/codex-sdk";
import { SolverDecisionV1Schema, type SolverDecisionV1 } from "@cobia/solver-sdk";
import { writeFile } from "node:fs/promises";
import { z } from "zod";
import type { CodexJob } from "./codex-job";
import { publicCodexEvent, type SolverCodexEvent } from "./codex-events";

interface CodexThreadLike {
  runStreamed(input: string, options: { outputSchema: unknown; signal: AbortSignal }): Promise<{
    events: AsyncGenerator<ThreadEvent>;
  }>;
}

export interface SolverCodexLike {
  startThread(options: ThreadOptions): CodexThreadLike;
}

const outputSchema = z.toJSONSchema(SolverDecisionV1Schema, {
  io: "input",
  unrepresentable: "any",
});

function runtimeEnvironment() {
  const result: Record<string, string> = {};
  for (const name of [
    "PATH", "HOME", "CODEX_HOME", "TMPDIR", "SSL_CERT_FILE", "SSL_CERT_DIR",
    "NODE_EXTRA_CA_CERTS", "HTTP_PROXY", "HTTPS_PROXY", "NO_PROXY",
  ]) {
    const value = process.env[name];
    if (value) result[name] = value;
  }
  return result;
}

export function createSolverCodex(): SolverCodexLike {
  return new Codex({
    ...(process.env.OPENAI_API_KEY ? { apiKey: process.env.OPENAI_API_KEY } : {}),
    env: runtimeEnvironment(),
    config: {
      features: { skill_mcp_dependency_install: false },
      shell_environment_policy: {
        inherit: "core",
        ignore_default_excludes: false,
        filters: {
          "*KEY*": "exclude",
          "*SECRET*": "exclude",
          "*TOKEN*": "exclude",
          "REFERENCE_SOLVER_PRIVATE_KEY": "exclude",
        },
      },
    },
  });
}

function parseDecision(text: string | undefined): SolverDecisionV1 {
  if (!text) throw new Error("Codex did not return a solver decision");
  let value: unknown;
  try { value = JSON.parse(text); }
  catch (error) { throw new Error("Codex did not return valid decision JSON", { cause: error }); }
  const parsed = SolverDecisionV1Schema.safeParse(value);
  if (!parsed.success) throw new Error(`Codex solver decision is invalid: ${parsed.error.message}`);
  return parsed.data;
}

export async function runCodexSolver(input: {
  job: CodexJob;
  model: string;
  reasoningEffort: ModelReasoningEffort;
  timeoutMs: number;
  codex?: SolverCodexLike;
  emit(event: SolverCodexEvent): void;
}): Promise<{ decision: SolverDecisionV1; threadId: string; usage: unknown }> {
  if (!Number.isSafeInteger(input.timeoutMs) || input.timeoutMs <= 0) {
    throw new Error("Codex solver timeout must be a positive integer");
  }
  const codex = input.codex ?? createSolverCodex();
  const thread = codex.startThread({
    model: input.model,
    modelReasoningEffort: input.reasoningEffort,
    workingDirectory: input.job.cwd,
    skipGitRepoCheck: true,
    sandboxMode: "workspace-write",
    approvalPolicy: "never",
    networkAccessEnabled: true,
    webSearchMode: "disabled",
  });
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), input.timeoutMs);
  let threadId: string | undefined;
  let finalMessage: string | undefined;
  let finalUsage: unknown;
  try {
    const turn = await thread.runStreamed(input.job.prompt, {
      outputSchema,
      signal: controller.signal,
    });
    for await (const event of turn.events) {
      const visible = publicCodexEvent(event);
      if (visible) input.emit(visible);
      if (event.type === "thread.started") threadId = event.thread_id;
      if (event.type === "item.completed" && event.item.type === "agent_message") {
        finalMessage = event.item.text;
      }
      if (event.type === "turn.completed") finalUsage = event.usage;
      if (event.type === "turn.failed") throw new Error(`Codex solver turn failed: ${event.error.message}`);
      if (event.type === "error") throw new Error(`Codex solver stream failed: ${event.message}`);
    }
  } finally {
    clearTimeout(timer);
  }
  if (!threadId) throw new Error("Codex did not start a solver thread");
  const decision = parseDecision(finalMessage);
  await writeFile(input.job.decisionPath, `${JSON.stringify(decision, null, 2)}\n`, { mode: 0o600 });
  return { decision, threadId, usage: finalUsage };
}
