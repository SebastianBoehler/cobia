import {
  commitment,
  OpenIntentPolicyV3Schema,
  SolverProfileClaimV1Schema,
  solverProfileClaimCommitmentV1,
} from "@cobia/domain";
import { isAddress, isAddressEqual, recoverMessageAddress } from "viem";
import { z } from "zod";

const HashSchema = z.string().regex(/^0x[0-9a-f]{64}$/);
const SignatureSchema = z.string().regex(/^0x[0-9a-fA-F]{130}$/);
const IntentSchema = z.object({
  id: z.string().uuid(),
  policy: OpenIntentPolicyV3Schema,
  policyHash: HashSchema,
  ownerSignature: SignatureSchema,
  competitionClosesAt: z.number().int().positive().safe(),
  links: z.object({ intent: z.string().startsWith("/api/intents/") }).strict(),
}).strict().superRefine((intent, context) => {
  if (intent.id !== intent.policy.requestId || intent.policyHash !== commitment(intent.policy)) {
    context.addIssue({ code: "custom", path: ["policyHash"], message: "Intent commitment mismatch" });
  }
  if (intent.competitionClosesAt !== intent.policy.competition.closesAt) {
    context.addIssue({ code: "custom", path: ["competitionClosesAt"], message: "Competition close mismatch" });
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

export type SolverIntentV1 = z.infer<typeof IntentSchema>;
export type SolverIntentListV1 = z.infer<typeof IntentListSchema>;

function exchangeOrigin(value: string): string {
  const url = new URL(value);
  const local = ["localhost", "127.0.0.1", "::1"].includes(url.hostname);
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
  if (!response.ok) throw new Error(`${label} returned HTTP ${response.status}`);
  if (!response.headers.get("content-type")?.toLowerCase().includes("application/json")) {
    throw new Error(`${label} returned a non-JSON response`);
  }
  const value = await response.text();
  if (new TextEncoder().encode(value).byteLength > 2 * 1024 * 1024) {
    throw new Error(`${label} response exceeds 2 MiB`);
  }
  return JSON.parse(value);
}

export function createSolverExchangeClient(input: {
  baseUrl: string;
  fetch?: typeof globalThis.fetch;
}) {
  const origin = exchangeOrigin(input.baseUrl);
  const fetchImpl = input.fetch ?? globalThis.fetch;
  return {
    async listIntents(): Promise<SolverIntentListV1> {
      const response = await fetchImpl(`${origin}/api/intents`, {
        headers: { accept: "application/json" }, cache: "no-store",
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
      const response = await fetchImpl(`${origin}/api/solvers`, {
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
  };
}
