import {
  commitment,
  verifyRouteBundleV2,
  type RouteBundleV2,
  type RouteSnapshotV2,
  type StablecoinPolicyV2,
} from "@cobia/domain";
import {
  createPublicClient,
  http,
  isAddress,
  toHex,
  type Address,
  type Hash,
} from "viem";
import { z } from "zod";
import { xLayer } from "../chain/xlayer";
import { registryHash } from "../adapters/registry";
import type { ExecutionReadClientV2, ExecutionWalletV2 } from "./engine-types";
import { parseGuidedPreparedStepV2 } from "./guided-records";
import { submitGuidedStepV2 } from "./guided-step";
import {
  buildExecutionMainnetProof,
  executionMainnetCommitment,
} from "./mainnet-proof";
import type { ExecutionRehearsalTrace } from "./rehearsal-trace";
import { createExecutionReadClientV2 } from "./viem-client";

const HashSchema = z.string().regex(/^0x[0-9a-fA-F]{64}$/)
  .transform((value) => value.toLowerCase() as Hash);
const AddressSchema = z.string().refine(isAddress)
  .transform((value) => value.toLowerCase() as Address);
const SessionSchema = z.object({
  attempt: z.object({
    id: z.uuid(), routeId: HashSchema, buyer: AddressSchema,
    executionChainId: z.literal(196),
    state: z.enum(["prepared", "active", "partial", "reconcile", "failed", "complete"]),
    nextOrdinal: z.number().int().nonnegative(), failureCode: z.string().nullable(),
  }).strict(),
  steps: z.array(z.object({
    ordinal: z.number().int().nonnegative(),
    state: z.enum(["prepared", "broadcasting", "submitted", "confirmed", "reconcile", "failed"]),
    kind: z.enum(["approval", "swap", "supply"]), label: z.string().optional(),
    to: AddressSchema, gasEstimateAtomic: z.string().regex(/^(0|[1-9][0-9]*)$/),
    transactionHash: HashSchema.nullable(), receipt: z.unknown().nullable(),
    evidence: z.unknown().nullable(), postcondition: z.unknown().nullable(),
    failureCode: z.string().nullable(),
  }).strict()),
  preparedStep: z.record(z.string(), z.unknown()).nullable(),
  token: z.string().regex(/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/),
  tokenExpiresAt: z.number().int().positive().safe(),
}).strict();

export type MainnetExecutionSessionV2 = z.infer<typeof SessionSchema>;
export interface MainnetExecutionWalletV2 extends ExecutionWalletV2 {
  account: Address;
  switchToXLayer(): Promise<void>;
}
type Fetcher = (input: string, init?: RequestInit) => Promise<Response>;

function randomHash(): Hash {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return toHex(bytes);
}

async function responseBody(response: Response): Promise<unknown> {
  const body = await response.json();
  if (!response.ok) {
    const message = typeof body === "object" && body && "message" in body &&
      typeof body.message === "string" ? body.message : "Mainnet execution request failed.";
    throw new Error(message);
  }
  return body;
}

function assertSession(
  value: unknown,
  expected: { routeId: Hash; buyer: Address },
): MainnetExecutionSessionV2 {
  const session = SessionSchema.parse(value);
  if (session.attempt.routeId !== expected.routeId.toLowerCase() ||
    session.attempt.buyer !== expected.buyer.toLowerCase()) {
    throw new Error("Execution session does not match purchased route");
  }
  return session;
}

export async function startMainnetExecutionV2(input: {
  routeId: Hash;
  bundleHash: Hash;
  realm: string;
  trace: ExecutionRehearsalTrace;
  wallet: MainnetExecutionWalletV2;
  fetcher?: Fetcher;
}): Promise<MainnetExecutionSessionV2> {
  await input.wallet.switchToXLayer();
  const proof = buildExecutionMainnetProof({
    realm: input.realm,
    routeId: input.routeId,
    bundleHash: input.bundleHash,
    buyer: input.wallet.account,
    executionChainId: 196,
    rehearsalTraceHash: commitment(input.trace),
    nonce: randomHash(),
    expiresAt: Math.floor(Date.now() / 1_000) + 240,
  });
  const signature = await input.wallet.request({
    method: "personal_sign",
    params: [executionMainnetCommitment(proof), input.wallet.account],
  });
  if (typeof signature !== "string") throw new Error("Wallet returned an invalid signature.");
  const fetcher = input.fetcher ?? fetch;
  const response = await fetcher(`/api/routes/${input.routeId}/executions`, {
    method: "POST", cache: "no-store", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ proof, signature }),
  });
  return assertSession(await responseBody(response), {
    routeId: input.routeId,
    buyer: input.wallet.account,
  });
}

export async function advanceMainnetExecutionV2(input: {
  routeId: Hash;
  session: MainnetExecutionSessionV2;
  action: { action: "submitted"; ordinal: number; transactionHash: Hash }
    | { action: "resolve" | "recover" | "arm" | "cancel"; ordinal: number };
  fetcher?: Fetcher;
}) {
  const fetcher = input.fetcher ?? fetch;
  const response = await fetcher(
    `/api/routes/${input.routeId}/executions/${input.session.attempt.id}`,
    { method: "POST", cache: "no-store", headers: {
      "Content-Type": "application/json", Authorization: `Bearer ${input.session.token}`,
    }, body: JSON.stringify(input.action) },
  );
  return assertSession(await responseBody(response), {
    routeId: input.routeId,
    buyer: input.session.attempt.buyer,
  });
}

export async function submitMainnetExecutionStepV2(input: {
  routeId: Hash;
  policy: StablecoinPolicyV2;
  snapshot: RouteSnapshotV2;
  bundle: RouteBundleV2;
  session: MainnetExecutionSessionV2;
  wallet: MainnetExecutionWalletV2;
  readClient?: ExecutionReadClientV2;
  fetcher?: Fetcher;
}) {
  if (!input.session.preparedStep) throw new Error("No execution step is prepared");
  if (input.session.preparedStep.state !== "prepared") {
    throw new Error("Execution step is already awaiting a wallet broadcast");
  }
  const nowSec = () => Math.floor(Date.now() / 1_000);
  const verdict = await verifyRouteBundleV2(
    input.policy, input.snapshot, input.bundle, input.bundle.solverAddress,
    { expectedAdapterRegistryHash: registryHash }, nowSec(),
  );
  if (!verdict.routeAuthorized) throw new Error("Purchased route is no longer executable");
  const readClient = input.readClient ?? createExecutionReadClientV2(createPublicClient({
    chain: xLayer, transport: http(),
  }));
  await input.wallet.switchToXLayer();
  const armed = await advanceMainnetExecutionV2({
    routeId: input.routeId, session: input.session, fetcher: input.fetcher,
    action: { action: "arm", ordinal: input.session.attempt.nextOrdinal },
  });
  if (!armed.preparedStep || armed.preparedStep.state !== "broadcasting") {
    throw new Error("Execution step was not durably armed");
  }
  let submitted;
  try {
    submitted = await submitGuidedStepV2({
      policy: input.policy, bundle: input.bundle, verdict, nowSec,
      readClient, wallet: input.wallet,
      prepared: parseGuidedPreparedStepV2(armed.preparedStep),
    });
  } catch (error) {
    if (typeof error === "object" && error !== null && "code" in error && error.code === 4001) {
      await advanceMainnetExecutionV2({
        routeId: input.routeId, session: armed, fetcher: input.fetcher,
        action: { action: "cancel", ordinal: input.session.attempt.nextOrdinal },
      });
    }
    throw error;
  }
  return advanceMainnetExecutionV2({
    routeId: input.routeId, session: armed, fetcher: input.fetcher,
    action: { action: "submitted", ordinal: input.session.attempt.nextOrdinal,
      transactionHash: submitted.hash },
  });
}
