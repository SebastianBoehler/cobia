import {
  commitment, solverDecisionClaimCommitmentV1, solverProfileClaimCommitmentV1,
} from "@cobia/domain";
import {
  createSolverExchangeClient, watchSolverIntents, type SolverIntentV1,
} from "@cobia/solver-sdk";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { keccak256, toHex, type Hash, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { z } from "zod";
import { prepareCodexJob } from "./codex-job";
import { readExistingCodexDecision } from "./codex-output";
import { runCodexSolver } from "./codex-runner";
import { IntentAttempts, SolverJobStateSchema, WorkLimiter, type SolverJobState } from "./job-control";
import { REFERENCE_CAPABILITIES } from "./route-tool";
import { readReferenceSolverConfig, type ReferenceSolverConfig } from "./solver-config";

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
  record(revision: number, state: string): Promise<void>;
}) {
  const job = await prepareCodexJob({
    root: input.config.job_root,
    intent: input.intent,
    skillsSource: fileURLToPath(new URL("../skills", import.meta.url)),
    exploration: input.config,
  });
  let decision = await readExistingCodexDecision(job.decisionPath);
  if (decision) {
    output({ event: "codex-decision-reused", intentId: input.intent.id,
      revision: input.revision, decision: decision.decision });
  } else {
    const result = await runCodexSolver({
      job,
      timeoutMs: input.config.turn_timeout_ms,
      exploration: { riskLevel: input.config.risk_level,
        maxTurns: input.config.max_codex_turns_per_intent,
        maxTotalTokens: input.config.max_total_tokens_per_intent },
      emit: output,
    });
    decision = result.decision;
    output({ event: "codex-decision", intentId: input.intent.id,
      threadId: result.threadId, provider: "openai-codex", model: "config.toml",
      decision: decision.decision, exploration: result.usage });
  }
  const issuedAt = Math.floor(Date.now() / 1_000);
  const claim = { version: 1 as const, solverId: input.solverId, intentId: input.intent.id,
    revision: input.revision, decisionHash: commitment(decision), snapshotHash: input.intent.snapshotHash as Hash,
    nonce: nonce(), issuedAt, expiresAt: Math.min(issuedAt + 240, input.intent.competitionClosesAt) };
  if (claim.expiresAt <= claim.issuedAt) return;
  const signature = await input.account.signMessage({
    message: { raw: solverDecisionClaimCommitmentV1(claim) },
  });
  const receipt = await input.client.submitDecision({ claim, signature, decision });
  await input.record(claim.revision, receipt.state);
  output({ event: "decision", intentId: input.intent.id, decision: decision.decision,
    receiptState: receipt.state, submissionId: receipt.submissionId });
}

const privateKey = z.string().regex(/^0x[0-9a-fA-F]{64}$/)
  .parse(process.env.REFERENCE_SOLVER_PRIVATE_KEY) as Hex;
const configPath = process.env.CODEX_HOME
  ? join(process.env.CODEX_HOME, "config.toml")
  : fileURLToPath(new URL("../codex/config.toml", import.meta.url));
const config = await readReferenceSolverConfig(configPath);
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
  isHandled: (intent) => attempts.isHandled(intent.id),
  async onError(error, intent) {
    if (!intent) {
      output({ event: "poll-error", message: error instanceof Error ? error.message : String(error) });
      return;
    }
    const failed = attempts.failed(intent.id);
    await persistState();
    output({ event: "intent-error", intentId: intent.id,
      message: error instanceof Error ? error.message : String(error), attempts: failed.attempts,
      retry: failed.attempts >= maxAttempts ? "stopped" : new Date(failed.retryAfterMs).toISOString() });
  },
  async onIntent(intent) {
    const revision = (state[intent.id]?.attempts ?? 0) + 1;
    await limiter.run(() => processIntent({ ...worker, config, intent, revision,
      record(revision, receiptState) {
      attempts.completed(intent.id, revision, receiptState);
      return persistState();
    } }));
  },
});
