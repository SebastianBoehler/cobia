import {
  solverProfileClaimCommitmentV1,
} from "@cobia/domain";
import {
  createSolverExchangeClient, watchSolverIntents, type SolverIntentV1,
} from "@cobia/solver-sdk";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { keccak256, toHex, type Hash, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { z } from "zod";
import { prepareCodexJob } from "./codex-job";
import { readExistingCodexDecision } from "./codex-output";
import { runCodexSolver } from "./codex-runner";
import { decideSolver } from "./decision-source";
import { competitionWorkTimeoutMs } from "./intent-deadline";
import { IntentAttempts, SolverJobStateSchema, WorkLimiter, type SolverJobState } from "./job-control";
import { writeHeartbeat } from "./heartbeat";
import { REFERENCE_CAPABILITIES } from "./route-tool";
import {
  readReferenceSolverConfig, solverOperatingConfigPath, type ReferenceSolverConfig,
} from "./solver-config";
import { announceSolverRun, submitSolverDecision } from "./solver-run";
import { solve as solveReferenceIntent } from "./strategy";
import { handleIntentError } from "./worker-error";

function nonce(): Hash {
  return keccak256(toHex(crypto.getRandomValues(new Uint8Array(32))));
}

async function readState(path: string) {
  try { return SolverJobStateSchema.parse(JSON.parse(await readFile(path, "utf8"))); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return {};
    throw error;
  }
}

async function writeState(path: string, state: SolverJobState) {
  await mkdir(dirname(path), { recursive: true });
  const temporary = `${path}.tmp`;
  await writeFile(temporary, `${JSON.stringify(state, null, 2)}\n`, { mode: 0o600 });
  await rename(temporary, path);
}

function output(value: object) {
  process.stdout.write(`${JSON.stringify({ at: new Date().toISOString(), ...value })}\n`);
}

async function register(client: ReturnType<typeof createSolverExchangeClient>, input: {
  solverId: string; displayName: string; account: ReturnType<typeof privateKeyToAccount>;
}) {
  const issuedAt = Math.floor(Date.now() / 1_000);
  const claim = { version: 1 as const, solverId: input.solverId, displayName: input.displayName,
    operator: input.account.address.toLowerCase() as `0x${string}`,
    declaredCapabilities: [...REFERENCE_CAPABILITIES], nonce: nonce(),
    issuedAt, expiresAt: issuedAt + 600 };
  const signature = await input.account.signMessage({
    message: { raw: solverProfileClaimCommitmentV1(claim) },
  });
  await client.registerSolver({ claim, signature });
}

async function processIntent(input: {
  client: ReturnType<typeof createSolverExchangeClient>;
  solverId: string;
  account: ReturnType<typeof privateKeyToAccount>;
  intent: SolverIntentV1;
  revision: number;
  config: ReferenceSolverConfig;
  limiter: WorkLimiter;
  signal: AbortSignal;
  record(revision: number, state: string): Promise<void>;
}) {
  await announceSolverRun({ client: input.client, account: input.account,
    solverId: input.solverId, intent: input.intent, revision: input.revision });
  output({ event: "run-started", intentId: input.intent.id, revision: input.revision });
  const selected = await decideSolver({
    mode: input.config.mode,
    schedule: (work) => input.limiter.run(work),
    solveReference: () => solveReferenceIntent(input.intent),
    async solveAgentic() {
      const timeoutMs = competitionWorkTimeoutMs({
        competitionClosesAt: input.intent.competitionClosesAt,
        maximumMs: input.config.turn_timeout_ms,
      });
      if (timeoutMs === 0) {
        return { version: 1, decision: "abstain", reasonCode: "COMPETITION_WINDOW_CLOSED" };
      }
      const job = await prepareCodexJob({
        root: input.config.job_root,
        intent: input.intent,
        skillsSource: fileURLToPath(new URL("../skills", import.meta.url)),
        exploration: input.config,
      });
      const existing = await readExistingCodexDecision(job.decisionPath);
      if (existing) {
        output({ event: "codex-decision-reused", intentId: input.intent.id,
          revision: input.revision, decision: existing.decision });
        return existing;
      }
      const runTimeoutMs = competitionWorkTimeoutMs({
        competitionClosesAt: input.intent.competitionClosesAt,
        maximumMs: timeoutMs,
      });
      if (runTimeoutMs === 0) {
        return { version: 1, decision: "abstain", reasonCode: "COMPETITION_WINDOW_CLOSED" };
      }
      const result = await runCodexSolver({
        job,
        timeoutMs: runTimeoutMs,
        exploration: { riskLevel: input.config.risk_level,
          maxTurns: input.config.max_codex_turns_per_intent,
          maxTotalTokens: input.config.max_total_tokens_per_intent },
        signal: input.signal,
        emit: output,
      });
      output({ event: "codex-decision", intentId: input.intent.id,
        threadId: result.threadId, provider: "codex-sdk", model: "config.toml",
        decision: result.decision.decision, exploration: result.usage });
      return result.decision;
    },
    onAgenticError(error) {
      output({ event: "open-error", intentId: input.intent.id,
        message: error instanceof Error ? error.message : String(error) });
    },
    onReferenceError(error) {
      output({ event: "reference-error", intentId: input.intent.id,
        message: error instanceof Error ? error.message : String(error) });
    },
  });
  const decision = selected.decision;
  output({ event: "decision-selected", source: selected.source, intentId: input.intent.id,
    revision: input.revision, decision: decision.decision });
  const receipt = await submitSolverDecision({
    client: input.client, account: input.account, solverId: input.solverId,
    intent: input.intent, revision: input.revision, decision,
  });
  if (!receipt) return;
  await input.record(input.revision, receipt.state);
  output({ event: "decision", intentId: input.intent.id, decision: decision.decision,
    receiptState: receipt.state, submissionId: receipt.submissionId });
}

const privateKey = z.string().regex(/^0x[0-9a-fA-F]{64}$/)
  .parse(process.env.REFERENCE_SOLVER_PRIVATE_KEY) as Hex;
const configPath = solverOperatingConfigPath();
const config = await readReferenceSolverConfig(configPath);
output({ event: "operating-config", configPath, turnTimeoutMs: config.turn_timeout_ms,
  maxTurns: config.max_codex_turns_per_intent,
  maxTotalTokens: config.max_total_tokens_per_intent });
const account = privateKeyToAccount(privateKey);
const client = createSolverExchangeClient({
  baseUrl: config.exchange_url,
});
const worker = {
  client,
  solverId: config.solver_id,
  account,
  statePath: config.state_file,
};
await register(client, { ...worker,
  displayName: config.display_name });
let registeredAtMs = Date.now();
output({ event: "registered", solverId: worker.solverId, operator: account.address });
const state = await readState(worker.statePath);
const maxAttempts = config.max_attempts_per_intent;
const attempts = new IntentAttempts(state, { maxAttempts,
  retryBaseMs: config.retry_base_ms });
const limiter = new WorkLimiter(config.max_parallel_jobs);
let pendingWrite = Promise.resolve();
function persistState() {
  pendingWrite = pendingWrite.then(() => writeState(worker.statePath, state));
  return pendingWrite;
}
const controller = new AbortController();
process.once("SIGINT", () => controller.abort());
process.once("SIGTERM", () => controller.abort());
await watchSolverIntents({
  client,
  signal: controller.signal,
  pollIntervalMs: config.poll_interval_ms,
  async onPoll() {
    await writeHeartbeat(worker.statePath);
    if (Date.now() - registeredAtMs >= 120_000) {
      await register(client, { ...worker, displayName: config.display_name });
      registeredAtMs = Date.now();
      output({ event: "registration-refreshed", solverId: worker.solverId });
    }
  },
  isHandled: (intent) => competitionWorkTimeoutMs({
    competitionClosesAt: intent.competitionClosesAt,
    maximumMs: config.turn_timeout_ms,
  }) === 0 || attempts.isHandled(intent.id),
  async onError(error, intent) {
    if (!intent) {
      output({ event: "poll-error", message: error instanceof Error ? error.message : String(error) });
      return;
    }
    const result = await handleIntentError({ error, intent, attempts, maxAttempts,
      client, account, solverId: worker.solverId, persist: persistState });
    output({ event: "intent-error", intentId: intent.id,
      message: error instanceof Error ? error.message : String(error), attempts: result.attempts,
      retry: result.retryable ? new Date(result.retryAfterMs!).toISOString() : "stopped",
      terminalState: result.terminalState, terminalError: result.terminalError });
  },
  async onIntent(intent) {
    if (competitionWorkTimeoutMs({ competitionClosesAt: intent.competitionClosesAt,
      maximumMs: config.turn_timeout_ms }) === 0) {
      attempts.stop(intent.id);
      await persistState();
      output({ event: "intent-expired", intentId: intent.id });
      return;
    }
    const revision = attempts.revision(intent.id);
    attempts.started(intent.id, revision);
    await persistState();
    await processIntent({ ...worker, config, limiter, signal: controller.signal, intent, revision,
      record(revision, receiptState) {
        attempts.completed(intent.id, revision, receiptState);
        return persistState();
      } });
  },
});
