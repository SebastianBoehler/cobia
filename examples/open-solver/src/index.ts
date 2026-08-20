import {
  commitment, solverDecisionClaimCommitmentV1, solverProfileClaimCommitmentV1,
} from "@cobia/domain";
import {
  createSolverExchangeClient, watchSolverIntents, type SolverIntentV1,
} from "@cobia/solver-sdk";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { keccak256, toHex, type Hash, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { z } from "zod";
import { solve } from "./strategy";

const StateSchema = z.record(z.string().uuid(), z.object({
  revision: z.number().int().positive(), state: z.string(),
}).strict());

function nonce(): Hash {
  return keccak256(toHex(crypto.getRandomValues(new Uint8Array(32))));
}

async function readState(path: string) {
  try { return StateSchema.parse(JSON.parse(await readFile(path, "utf8"))); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return {};
    throw error;
  }
}

async function writeState(path: string, state: z.infer<typeof StateSchema>) {
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
    declaredCapabilities: ["aave-v3.supply@1", "curve-stableswap-ng.exact-input@1", "evm.raw@1"], nonce: nonce(),
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
  record(revision: number, state: string): Promise<void>;
}) {
  const decision = await solve(input.intent);
  const issuedAt = Math.floor(Date.now() / 1_000);
  const claim = { version: 1 as const, solverId: input.solverId, intentId: input.intent.id,
    revision: 1, decisionHash: commitment(decision), snapshotHash: input.intent.snapshotHash as Hash,
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
const account = privateKeyToAccount(privateKey);
const client = createSolverExchangeClient({
  baseUrl: process.env.COBIA_EXCHANGE_URL ?? "https://getcobia.com",
});
const worker = {
  client,
  solverId: process.env.REFERENCE_SOLVER_ID ?? "cobia-reference",
  account,
  statePath: process.env.REFERENCE_SOLVER_STATE_FILE ?? "/var/lib/cobia-solver/state.json",
};
await register(client, { ...worker,
  displayName: process.env.REFERENCE_SOLVER_NAME ?? "Cobia Reference Solver" });
output({ event: "registered", solverId: worker.solverId, operator: account.address });
const state = await readState(worker.statePath);
let pendingWrite = Promise.resolve();
const controller = new AbortController();
process.once("SIGINT", () => controller.abort());
process.once("SIGTERM", () => controller.abort());
await watchSolverIntents({
  client,
  signal: controller.signal,
  pollIntervalMs: Number(process.env.REFERENCE_SOLVER_POLL_MS ?? "1000"),
  isHandled: (intent) => Boolean(state[intent.id]),
  onError(error, intent) {
    output({ event: intent ? "intent-error" : "poll-error", intentId: intent?.id,
      message: error instanceof Error ? error.message : String(error) });
  },
  async onIntent(intent) {
    await processIntent({ ...worker, intent, record(revision, receiptState) {
      state[intent.id] = { revision, state: receiptState };
      pendingWrite = pendingWrite.then(() => writeState(worker.statePath, state));
      return pendingWrite;
    } });
  },
});
