import {
  CapabilityCompositionPolicyV1Schema,
  CapabilityCompositionSnapshotV1Schema,
  commitment,
  OpenIntentPolicyV3Schema,
  OpenIntentSnapshotV1Schema,
  SolverDecisionClaimV1Schema,
  SolverProfileClaimV1Schema,
  SolverRunClaimV1Schema,
  solverDecisionClaimCommitmentV1,
  solverProfileClaimCommitmentV1,
  solverRunClaimCommitmentV1,
} from "@cobia/domain";
import { isAddress, isAddressEqual, recoverMessageAddress } from "viem";
import { z } from "zod";
import { SolverDecisionV1Schema } from "./harness";

const HashSchema = z.string().regex(/^0x[0-9a-f]{64}$/);
const SignatureSchema = z.string().regex(/^0x[0-9a-fA-F]{130}$/);
const DEFAULT_REQUEST_TIMEOUT_MS = 15_000;
const DECISION_REQUEST_TIMEOUT_MS = 185_000;
const IntentSchema = z.object({
  id: z.string().uuid(),
  policy: z.discriminatedUnion("kind", [
    OpenIntentPolicyV3Schema,
    CapabilityCompositionPolicyV1Schema,
  ]),
  policyHash: HashSchema,
  ownerSignature: SignatureSchema,
  snapshot: z.discriminatedUnion("kind", [
    OpenIntentSnapshotV1Schema,
    CapabilityCompositionSnapshotV1Schema,
  ]),
  snapshotHash: HashSchema,
  competitionClosesAt: z.number().int().positive().safe(),
  links: z.object({
    intent: z.string().startsWith("/api/intents/"),
    decisions: z.string().endsWith("/decisions"),
  }).strict(),
}).strict().superRefine((intent, context) => {
  if (intent.id !== intent.policy.requestId || intent.policyHash !== commitment(intent.policy)) {
    context.addIssue({ code: "custom", path: ["policyHash"], message: "Intent commitment mismatch" });
  }
  if (intent.competitionClosesAt !== intent.policy.competition.closesAt) {
    context.addIssue({ code: "custom", path: ["competitionClosesAt"], message: "Competition close mismatch" });
  }
  if (intent.snapshot.requestId !== intent.id || intent.snapshotHash !== commitment(intent.snapshot)) {
    context.addIssue({ code: "custom", path: ["snapshotHash"], message: "Snapshot commitment mismatch" });
  }
  if (intent.policy.kind !== intent.snapshot.kind) {
    context.addIssue({ code: "custom", path: ["snapshot", "kind"],
      message: "Policy and snapshot kinds must match" });
  }
});

const IntentListSchema = z.object({
  observedAt: z.number().int().positive().safe(),
  intents: z.array(IntentSchema).max(30),
}).strict();
const SolverRegistrationSchema = z.object({
  solverId: z.string(),
  operator: z.string().refine(isAddress).transform((value) => value as `0x${string}`),
  links: z.object({ profile: z.string().startsWith("/solvers/") }).strict(),
}).strict();
const DecisionReceiptSchema = z.object({
  intentId: z.string().uuid(),
  solverId: z.string(),
  revision: z.number().int().positive(),
  state: z.enum(["accepted", "rejected", "abstained"]),
  submissionId: z.string().uuid().optional(),
  errorCodes: z.array(z.string()).optional(),
}).strict();
const RunReceiptSchema = z.object({
  intentId: z.string().uuid(),
  solverId: z.string(),
  revision: z.number().int().positive(),
  state: z.literal("running"),
}).strict();

export type SolverIntentV1 = z.infer<typeof IntentSchema>;
export type SolverIntentListV1 = z.infer<typeof IntentListSchema>;

export class SolverExchangeHttpError extends Error {
  constructor(readonly status: number, readonly code: string | undefined, label: string) {
    super(`${label} returned HTTP ${status}${code ? ` (${code})` : ""}`);
  }
}

function exchangeOrigin(value: string): string {
  const url = new URL(value);
  const local = ["localhost", "127.0.0.1", "::1", "host.docker.internal"].includes(url.hostname);
  if ((!local && url.protocol !== "https:") || (local && !["http:", "https:"].includes(url.protocol))) {
    throw new Error("Solver exchange origin must use HTTPS");
  }
  if (url.username || url.password) throw new Error("Solver exchange origin cannot contain credentials");
  if (url.search || url.hash || url.pathname !== "/") throw new Error("Solver exchange must be an origin");
  return url.origin;
}

async function verifyIntentSignature(intent: SolverIntentV1): Promise<void> {
  const signer = await recoverMessageAddress({
    message: { raw: intent.policyHash as `0x${string}` },
    signature: intent.ownerSignature as `0x${string}`,
  });
  if (!isAddressEqual(signer, intent.policy.owner)) {
    throw new Error(`Intent ${intent.id} owner signature mismatch`);
  }
}

async function boundedJson(response: Response, label: string): Promise<unknown> {
  if (!response.headers.get("content-type")?.toLowerCase().includes("application/json")) {
    if (!response.ok) throw new SolverExchangeHttpError(response.status, undefined, label);
    throw new Error(`${label} returned a non-JSON response`);
  }
  const value = await response.text();
  if (new TextEncoder().encode(value).byteLength > 2 * 1024 * 1024) {
    throw new Error(`${label} response exceeds 2 MiB`);
  }
  const parsed = JSON.parse(value) as unknown;
  if (!response.ok) {
    const code = z.object({ code: z.string().max(80) }).passthrough().safeParse(parsed);
    throw new SolverExchangeHttpError(response.status, code.success ? code.data.code : undefined, label);
  }
  return parsed;
}

export function createSolverExchangeClient(input: {
  baseUrl: string;
  fetch?: typeof globalThis.fetch;
}) {
  const origin = exchangeOrigin(input.baseUrl);
  const fetchImpl = input.fetch ?? globalThis.fetch;
  const request = (url: string, init: RequestInit = {},
    timeoutMs = DEFAULT_REQUEST_TIMEOUT_MS) => fetchImpl(url, {
    ...init,
    signal: init.signal ?? AbortSignal.timeout(timeoutMs),
  });
  return {
    async listIntents(): Promise<SolverIntentListV1> {
      const response = await request(`${origin}/api/intents`, {
        headers: { accept: "application/json" },
      });
      const list = IntentListSchema.parse(await boundedJson(response, "Intent exchange"));
      await Promise.all(list.intents.map(verifyIntentSignature));
      return list;
    },

    async registerSolver(input: { claim: unknown; signature: string }) {
      const claim = SolverProfileClaimV1Schema.parse(input.claim);
      const signature = SignatureSchema.parse(input.signature) as `0x${string}`;
      const signer = await recoverMessageAddress({
        message: { raw: solverProfileClaimCommitmentV1(claim) }, signature,
      });
      if (!isAddressEqual(signer, claim.operator)) throw new Error("Solver profile signature mismatch");
      const response = await request(`${origin}/api/solvers`, {
        method: "POST",
        headers: { accept: "application/json", "content-type": "application/json" },
        body: JSON.stringify({ claim, signature }),
      });
      const registration = SolverRegistrationSchema.parse(
        await boundedJson(response, "Solver exchange"),
      );
      if (registration.solverId !== claim.solverId ||
          !isAddressEqual(registration.operator, claim.operator)) {
        throw new Error("Solver registration response mismatch");
      }
      return registration;
    },

    async startRun(input: { claim: unknown; signature: string }) {
      const claim = SolverRunClaimV1Schema.parse(input.claim);
      const signature = SignatureSchema.parse(input.signature) as `0x${string}`;
      await recoverMessageAddress({
        message: { raw: solverRunClaimCommitmentV1(claim) }, signature,
      });
      const response = await request(`${origin}/api/intents/${claim.intentId}/runs`, {
        method: "POST",
        headers: { accept: "application/json", "content-type": "application/json" },
        body: JSON.stringify({ claim, signature }),
      });
      const receipt = RunReceiptSchema.parse(await boundedJson(response, "Solver run exchange"));
      if (receipt.intentId !== claim.intentId || receipt.solverId !== claim.solverId ||
          receipt.revision !== claim.revision) {
        throw new Error("Solver run response mismatch");
      }
      return receipt;
    },

    async submitDecision(input: { claim: unknown; signature: string; decision: unknown }) {
      const claim = SolverDecisionClaimV1Schema.parse(input.claim);
      const decision = SolverDecisionV1Schema.parse(input.decision);
      if (claim.decisionHash !== commitment(decision)) {
        throw new Error("Solver decision commitment mismatch");
      }
      const signature = SignatureSchema.parse(input.signature) as `0x${string}`;
      await recoverMessageAddress({
        message: { raw: solverDecisionClaimCommitmentV1(claim) }, signature,
      });
      const response = await request(`${origin}/api/intents/${claim.intentId}/decisions`, {
        method: "POST",
        headers: { accept: "application/json", "content-type": "application/json" },
        body: JSON.stringify({ claim, signature, decision }),
      }, DECISION_REQUEST_TIMEOUT_MS);
      const receipt = DecisionReceiptSchema.parse(
        await boundedJson(response, "Solver decision exchange"),
      );
      if (receipt.intentId !== claim.intentId || receipt.solverId !== claim.solverId ||
          receipt.revision !== claim.revision) {
        throw new Error("Solver decision response mismatch");
      }
      return receipt;
    },
  };
}
