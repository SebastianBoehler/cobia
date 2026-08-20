import {
  canonicalJson,
  commitment,
} from "@cobia/domain";
import {
  isAddress,
  isAddressEqual,
  recoverTypedDataAddress,
  type Address,
  type Hash,
  type Hex,
} from "viem";
import { z } from "zod";
import {
  EIP3009_AUTHORIZATION_TYPES,
  EIP3009_RPC_TYPES,
} from "../payments/eip3009-authorization";
import { compileX402AuthorizationPlanV1 } from "./x402-plan";
import { X402AuthorizationPlanV1Schema } from "./x402-plan";

const AddressSchema = z.string().refine(isAddress).transform(
  (value) => value.toLowerCase() as Address,
);
const HashSchema = z.string().regex(/^0x[0-9a-fA-F]{64}$/).transform(
  (value) => value.toLowerCase() as Hash,
).refine((value) => !/^0x0{64}$/.test(value));
const AtomicSchema = z.string().regex(/^[1-9][0-9]*$/).max(78);
const TimestampSchema = z.string().regex(/^(0|[1-9][0-9]*)$/).max(20);
const ChainSchema = z.union([z.literal(196), z.literal(8453)]);
const SignatureSchema = z.string().regex(/^0x[0-9a-fA-F]{130}$/).transform(
  (value) => value.toLowerCase() as Hex,
);

const AuthorizationSchema = z.object({
  from: AddressSchema, to: AddressSchema, value: AtomicSchema,
  validAfter: TimestampSchema, validBefore: TimestampSchema, nonce: HashSchema,
}).strict();
const AcceptedSchema = z.object({
  scheme: z.literal("exact"), network: z.enum(["eip155:196", "eip155:8453"]), amount: AtomicSchema,
  asset: AddressSchema, payTo: AddressSchema, maxTimeoutSeconds: z.number().int().min(1).max(3_600),
  extra: z.object({
    assetTransferMethod: z.literal("eip3009"), paymentFlow: z.literal("authorization"),
    name: z.string().min(1).max(128), version: z.string().min(1).max(32),
  }).strict(),
}).strict();

export const X402AuthorizationTemplateV1Schema = z.object({
  version: z.literal(1), chainId: ChainSchema,
  offerCommitment: HashSchema, policyHash: HashSchema, programHash: HashSchema, planHash: HashSchema,
  endpoint: z.url().refine((value) => new URL(value).protocol === "https:"),
  facilitator: z.url().refine((value) => new URL(value).protocol === "https:"),
  resource: z.object({ url: z.url().refine((value) => new URL(value).protocol === "https:") }).strict(),
  accepted: AcceptedSchema,
  authorization: AuthorizationSchema,
  typedData: z.object({
    domain: z.object({
      name: z.string().min(1).max(128), version: z.string().min(1).max(32),
      chainId: ChainSchema, verifyingContract: AddressSchema,
    }).strict(),
    types: z.object({
      TransferWithAuthorization: z.tuple([
        z.object({ name: z.literal("from"), type: z.literal("address") }).strict(),
        z.object({ name: z.literal("to"), type: z.literal("address") }).strict(),
        z.object({ name: z.literal("value"), type: z.literal("uint256") }).strict(),
        z.object({ name: z.literal("validAfter"), type: z.literal("uint256") }).strict(),
        z.object({ name: z.literal("validBefore"), type: z.literal("uint256") }).strict(),
        z.object({ name: z.literal("nonce"), type: z.literal("bytes32") }).strict(),
      ]),
    }).strict(),
    primaryType: z.literal("TransferWithAuthorization"),
    message: AuthorizationSchema,
  }).strict(),
}).strict().superRefine((template, context) => {
  const sameAuthorization = canonicalJson(template.authorization) === canonicalJson(template.typedData.message);
  if (!sameAuthorization) {
    context.addIssue({ code: "custom", path: ["typedData", "message"], message: "Signed message must equal authorization" });
  }
  if (template.resource.url !== template.endpoint) {
    context.addIssue({ code: "custom", path: ["resource", "url"], message: "Resource URL must equal endpoint" });
  }
  if (!isAddressEqual(template.authorization.to, template.accepted.payTo) ||
    template.authorization.value !== template.accepted.amount) {
    context.addIssue({ code: "custom", path: ["authorization"], message: "Authorization must equal accepted payment" });
  }
  if (!isAddressEqual(template.typedData.domain.verifyingContract, template.accepted.asset) ||
    template.typedData.domain.name !== template.accepted.extra.name ||
    template.typedData.domain.version !== template.accepted.extra.version) {
    context.addIssue({ code: "custom", path: ["typedData", "domain"], message: "Token domain must equal accepted asset identity" });
  }
  if (BigInt(template.authorization.validBefore) <= BigInt(template.authorization.validAfter) ||
    BigInt(template.authorization.validBefore) - BigInt(template.authorization.validAfter) >
      BigInt(template.accepted.maxTimeoutSeconds + 30)) {
    context.addIssue({ code: "custom", path: ["authorization"], message: "Authorization validity exceeds payment timeout" });
  }
});

export type X402AuthorizationTemplateV1 = z.infer<typeof X402AuthorizationTemplateV1Schema>;

export function x402TypedDataV1(raw: unknown) {
  const template = X402AuthorizationTemplateV1Schema.parse(raw);
  return {
    ...template.typedData,
    message: {
      ...template.typedData.message,
      value: BigInt(template.typedData.message.value),
      validAfter: BigInt(template.typedData.message.validAfter),
      validBefore: BigInt(template.typedData.message.validBefore),
    },
  };
}

export function x402WalletTypedDataV1(raw: unknown) {
  return {
    ...x402TypedDataV1(raw),
    types: EIP3009_RPC_TYPES,
  };
}

export function prepareX402AuthorizationV1(raw: {
  program: unknown; policy: unknown; offer: unknown; manifest: unknown; nowSec: number;
}): X402AuthorizationTemplateV1 {
  const plan = compileX402AuthorizationPlanV1(raw);
  return prepareX402AuthorizationFromPlanV1(plan, raw.nowSec);
}

export function prepareX402AuthorizationFromPlanV1(
  rawPlan: unknown,
  nowSec: number,
): X402AuthorizationTemplateV1 {
  const plan = X402AuthorizationPlanV1Schema.parse(rawPlan);
  const validBefore = Math.min(
    nowSec + plan.maxTimeoutSec,
    plan.offerExpiresAt,
    plan.programDeadline,
  );
  if (!Number.isSafeInteger(nowSec) || nowSec <= 0 || validBefore <= nowSec) {
    throw new Error("x402 authorization validity is empty");
  }
  const authorization = {
    from: plan.owner, to: plan.payee, value: plan.amount,
    validAfter: `${Math.max(0, nowSec - 30)}`, validBefore: `${validBefore}`,
    nonce: plan.authorizationNonce,
  };
  const domain = {
    name: plan.token.eip712Name,
    version: plan.token.eip712Version,
    chainId: plan.chainId,
    verifyingContract: plan.asset,
  };
  return X402AuthorizationTemplateV1Schema.parse({
    version: 1, chainId: plan.chainId, offerCommitment: plan.offerCommitment,
    policyHash: plan.policyHash, programHash: plan.programHash, planHash: commitment(plan),
    endpoint: plan.endpoint, facilitator: plan.facilitator, resource: { url: plan.endpoint },
    accepted: {
      scheme: "exact", network: `eip155:${plan.chainId}` as "eip155:196" | "eip155:8453", amount: plan.amount,
      asset: plan.asset, payTo: plan.payee, maxTimeoutSeconds: plan.maxTimeoutSec,
      extra: {
        assetTransferMethod: "eip3009", paymentFlow: "authorization",
        name: domain.name, version: domain.version,
      },
    },
    authorization,
    typedData: {
      domain, types: EIP3009_AUTHORIZATION_TYPES,
      primaryType: "TransferWithAuthorization", message: authorization,
    },
  });
}

export async function finalizeX402PaymentV2(raw: {
  expected: unknown; submitted: unknown; signature: unknown;
}) {
  const expected = X402AuthorizationTemplateV1Schema.parse(raw.expected);
  let submitted: X402AuthorizationTemplateV1;
  try {
    submitted = X402AuthorizationTemplateV1Schema.parse(raw.submitted);
  } catch {
    throw new Error("x402 authorization template mismatch");
  }
  if (commitment(expected) !== commitment(submitted)) {
    throw new Error("x402 authorization template mismatch");
  }
  const signature = SignatureSchema.parse(raw.signature);
  const signer = await recoverTypedDataAddress({ ...x402TypedDataV1(expected), signature });
  if (!isAddressEqual(signer, expected.authorization.from)) {
    throw new Error("x402 signature does not match policy owner");
  }
  const paymentPayload = {
    x402Version: 2 as const,
    resource: expected.resource,
    accepted: expected.accepted,
    payload: { signature, authorization: expected.authorization },
    extensions: {},
  };
  return {
    paymentPayload,
    paymentSignature: Buffer.from(canonicalJson(paymentPayload), "utf8").toString("base64"),
  };
}
