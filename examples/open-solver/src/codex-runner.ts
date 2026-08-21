import {
  Codex,
  type ThreadEvent,
  type ThreadOptions,
  type Usage,
} from "@openai/codex-sdk";
import { SolverDecisionV1Schema, type SolverDecisionV1 } from "@cobia/solver-sdk";
import { writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
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

export interface CodexExplorationBudget {
  riskLevel: "conservative" | "balanced" | "opportunistic";
  maxTurns: number;
  maxTotalTokens: number;
}

const CodexDecisionEnvelopeSchema = z.object({
  decisionJson: z.string().min(2),
}).strict();

const outputSchema = z.toJSONSchema(CodexDecisionEnvelopeSchema, {
  io: "input",
});

function runtimeEnvironment() {
  const result: Record<string, string> = {};
  for (const name of [
    "PATH", "HOME", "CODEX_HOME", "TMPDIR", "SSL_CERT_FILE", "SSL_CERT_DIR",
    "NODE_EXTRA_CA_CERTS", "HTTP_PROXY", "HTTPS_PROXY", "NO_PROXY", "OPENROUTER_API_KEY",
  ]) {
    const value = process.env[name];
    if (value) result[name] = value;
  }
  return result;
}

function routeEnvironment() {
  return Object.fromEntries([
    "XLAYER_RPC_URL", "ETHEREUM_RPC_URL", "COBIA_EXECUTOR_V3_ADDRESS", "ANVIL_PORT",
  ].flatMap((name) => process.env[name] ? [[name, process.env[name]!]] : []));
}

export function solverCodexConfig(job: CodexJob) {
  const repositoryRoot = fileURLToPath(new URL("../../..", import.meta.url));
  return {
    features: { shell_tool: false, unified_exec: false, skill_mcp_dependency_install: false },
    agents: { enabled: false },
    mcp_servers: {
      cobia_route: {
        command: process.execPath,
        args: [fileURLToPath(new URL("./route-mcp-server.mjs", import.meta.url)),
          "--intent", job.intentPath],
        cwd: repositoryRoot,
        env: routeEnvironment(),
        enabled_tools: ["capabilities", "solve", "exact_call"],
        default_tools_approval_mode: "approve",
        required: true,
        startup_timeout_sec: 20,
        tool_timeout_sec: 180,
      },
    },
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
  };
}

export function createSolverCodex(job: CodexJob): SolverCodexLike {
  return new Codex({
    ...(process.env.OPENAI_API_KEY ? { apiKey: process.env.OPENAI_API_KEY } : {}),
    env: runtimeEnvironment(),
    config: solverCodexConfig(job),
  });
}

function parseDecision(text: string | undefined): SolverDecisionV1 {
  if (!text) throw new Error("Codex did not return a solver decision");
  let envelope: z.infer<typeof CodexDecisionEnvelopeSchema>;
  try { envelope = CodexDecisionEnvelopeSchema.parse(JSON.parse(text)); }
  catch (error) { throw new Error("Codex did not return a valid decision envelope", { cause: error }); }
  let value: unknown;
  try { value = JSON.parse(envelope.decisionJson); }
  catch (error) { throw new Error("Codex envelope did not contain valid decision JSON", { cause: error }); }
  const parsed = SolverDecisionV1Schema.safeParse(value);
  if (!parsed.success) throw new Error(`Codex solver decision is invalid: ${parsed.error.message}`);
  return parsed.data;
}

function tokenCount(usage: Usage) {
  return usage.input_tokens + usage.output_tokens;
}

function nextPrompt(input: {
  decision: Extract<SolverDecisionV1, { decision: "abstain" }>;
  exploration: CodexExplorationBudget;
  nextTurn: number;
  tokensRemaining: number;
}) {
  return `Your previous turn abstained with ${input.decision.reasonCode}. Do not stop at the ` +
    "curated quote. Continue the same intent search now. Use web research and installed protocol " +
    "skills to inspect alternative pools, multi-hop paths, established external protocols, and " +
    "atomic market inefficiencies. Use the exact-call tool for any complete candidate. " +
    `Risk level: ${input.exploration.riskLevel}. This is turn ${input.nextTurn} of ` +
    `${input.exploration.maxTurns}; ${input.tokensRemaining} total tokens remain. Never weaken the ` +
    "signed policy or invent evidence. Return the required decisionJson envelope for this turn.";
}

export async function runCodexSolver(input: {
  job: CodexJob;
  timeoutMs: number;
  exploration: CodexExplorationBudget;
  codex?: SolverCodexLike;
  emit(event: SolverCodexEvent): void;
}): Promise<{ decision: SolverDecisionV1; threadId: string; usage: {
  turns: number; inputTokens: number; cachedInputTokens: number; outputTokens: number;
  reasoningOutputTokens: number; totalTokens: number; stopReason: "submitted" | "turn-limit" |
  "token-limit";
} }> {
  if (!Number.isSafeInteger(input.timeoutMs) || input.timeoutMs <= 0) {
    throw new Error("Codex solver timeout must be a positive integer");
  }
  if (!Number.isSafeInteger(input.exploration.maxTurns) || input.exploration.maxTurns <= 0 ||
      !Number.isSafeInteger(input.exploration.maxTotalTokens) ||
      input.exploration.maxTotalTokens <= 0) {
    throw new Error("Codex exploration budget must use positive integers");
  }
  const codex = input.codex ?? createSolverCodex(input.job);
  const thread = codex.startThread({
    workingDirectory: input.job.cwd,
    skipGitRepoCheck: true,
    sandboxMode: "workspace-write",
    approvalPolicy: "never",
    networkAccessEnabled: true,
  });
  let threadId: string | undefined;
  let decision: SolverDecisionV1 | undefined;
  const usage = { turns: 0, inputTokens: 0, cachedInputTokens: 0,
    outputTokens: 0, reasoningOutputTokens: 0, totalTokens: 0 };
  let prompt = input.job.prompt;
  for (let turnIndex = 0; turnIndex < input.exploration.maxTurns; turnIndex += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), input.timeoutMs);
    let finalMessage: string | undefined;
    let turnUsage: Usage | undefined;
    try {
      const turn = await thread.runStreamed(prompt, { outputSchema, signal: controller.signal });
      for await (const event of turn.events) {
        const visible = publicCodexEvent(event);
        if (visible) input.emit(visible);
        if (event.type === "thread.started") threadId = event.thread_id;
        if (event.type === "item.completed" && event.item.type === "agent_message") {
          finalMessage = event.item.text;
        }
        if (event.type === "turn.completed") turnUsage = event.usage;
        if (event.type === "turn.failed") {
          throw new Error(`Codex solver turn failed: ${event.error.message}`);
        }
        if (event.type === "error") throw new Error(`Codex solver stream failed: ${event.message}`);
      }
    } finally {
      clearTimeout(timer);
    }
    if (!turnUsage) throw new Error("Codex solver turn did not report usage");
    decision = parseDecision(finalMessage);
    usage.turns += 1;
    usage.inputTokens += turnUsage.input_tokens;
    usage.cachedInputTokens += turnUsage.cached_input_tokens;
    usage.outputTokens += turnUsage.output_tokens;
    usage.reasoningOutputTokens += turnUsage.reasoning_output_tokens;
    usage.totalTokens += tokenCount(turnUsage);
    if (decision.decision === "submit" || usage.totalTokens >= input.exploration.maxTotalTokens ||
        usage.turns >= input.exploration.maxTurns) break;
    const tokensRemaining = input.exploration.maxTotalTokens - usage.totalTokens;
    input.emit({ event: "codex-exploration-continued", reasonCode: decision.reasonCode,
      nextTurn: usage.turns + 1, turnsRemaining: input.exploration.maxTurns - usage.turns,
      tokensRemaining });
    prompt = nextPrompt({ decision, exploration: input.exploration,
      nextTurn: usage.turns + 1, tokensRemaining });
  }
  if (!threadId) throw new Error("Codex did not start a solver thread");
  if (!decision) throw new Error("Codex did not return a solver decision");
  await writeFile(input.job.decisionPath, `${JSON.stringify(decision, null, 2)}\n`, { mode: 0o600 });
  const stopReason = decision.decision === "submit" ? "submitted"
    : usage.totalTokens >= input.exploration.maxTotalTokens ? "token-limit" : "turn-limit";
  return { decision, threadId, usage: { ...usage, stopReason } };
}
