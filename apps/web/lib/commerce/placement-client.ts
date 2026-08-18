import type { Hex } from "viem";
import { z } from "zod";
import {
  X402AuthorizationTemplateV1Schema,
  x402TypedDataV1,
} from "./x402-authorization";
import { X402AuthorizationPlanV1Schema } from "./x402-plan";
import { X402SettlementResponseV2Schema } from "./x402-resource-client";

type Fetcher = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
const HashSchema = z.string().regex(/^0x[0-9a-fA-F]{64}$/).transform(
  (value) => value.toLowerCase() as `0x${string}`,
);
const SignatureSchema = z.string().regex(/^0x[0-9a-fA-F]{130}$/).transform(
  (value) => value.toLowerCase() as Hex,
);
const PlacementSchema = z.object({
  id: z.string().uuid(), state: z.enum(["prepared", "authorizing", "submitted", "confirmed", "rejected"]),
}).passthrough();
const PrepareResponseSchema = z.object({
  placement: PlacementSchema,
  plan: X402AuthorizationPlanV1Schema,
  authorization: X402AuthorizationTemplateV1Schema,
}).strict();
const AuthorizationResponseSchema = z.object({
  state: z.literal("submitted"), transactionHash: HashSchema,
  authorizationHash: HashSchema, settlement: X402SettlementResponseV2Schema,
  resourceHash: HashSchema, resourceBodyBase64: z.string(),
}).passthrough();
const ConfirmationResponseSchema = z.object({
  state: z.literal("confirmed"), outcome: z.literal("payment-settled"),
  transactionHash: HashSchema, evidence: z.unknown(), evidenceHash: HashSchema,
}).passthrough();

async function responseJson(response: Response): Promise<unknown> {
  let body: unknown;
  try { body = await response.json(); } catch { throw new Error("Commerce API returned invalid JSON"); }
  if (!response.ok) {
    const parsed = z.object({ message: z.string().min(1) }).passthrough().safeParse(body);
    throw new Error(parsed.success ? parsed.data.message : `Commerce API returned HTTP ${response.status}`);
  }
  return body;
}

export async function prepareCommercePlacementClientV1(input: {
  policy: unknown; ownerSignature: unknown; program: unknown; evidence: unknown;
  fetcher?: Fetcher;
}) {
  const fetcher = input.fetcher ?? fetch;
  const response = await fetcher("/api/commerce/placements", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      policy: input.policy, ownerSignature: input.ownerSignature,
      program: input.program, evidence: input.evidence,
    }),
  });
  return PrepareResponseSchema.parse(await responseJson(response));
}

export async function authorizeCommercePlacementClientV1(input: {
  placement: z.infer<typeof PlacementSchema>;
  plan: z.infer<typeof X402AuthorizationPlanV1Schema>;
  authorization: z.infer<typeof X402AuthorizationTemplateV1Schema>;
  wallet: { signTypedData(value: ReturnType<typeof x402TypedDataV1>): Promise<Hex> };
  fetcher?: Fetcher;
}) {
  const fetcher = input.fetcher ?? fetch;
  const signature = SignatureSchema.parse(await input.wallet.signTypedData(
    x402TypedDataV1(input.authorization),
  ));
  const response = await fetcher(`/api/commerce/placements/${input.placement.id}/authorization`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ template: input.authorization, signature }),
  });
  return {
    ...AuthorizationResponseSchema.parse(await responseJson(response)),
    placementId: input.placement.id, plan: input.plan, template: input.authorization, signature,
  };
}

export async function confirmCommerceSettlementClientV1(input: {
  placementId: string; plan: unknown; template: unknown; signature: unknown;
  settlement: unknown; fetcher?: Fetcher;
}) {
  const placementId = z.string().uuid().parse(input.placementId);
  const fetcher = input.fetcher ?? fetch;
  const response = await fetcher(`/api/commerce/placements/${placementId}/settlement`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      plan: input.plan, template: input.template,
      signature: input.signature, settlement: input.settlement,
    }),
  });
  return ConfirmationResponseSchema.parse(await responseJson(response));
}
