import { Challenge, Credential } from "@okxweb3/mpp";
import { chargeSchema } from "@okxweb3/mpp/evm";
import { isAddress, isAddressEqual, type Address } from "viem";
import {
  validatePaymentChallenge,
  type ExpectedPaymentAuthorization,
} from "./challenge";
import { requireEip3009OwnerSignature } from "./eip3009-authorization";

const BYTES32 = /^0x[0-9a-fA-F]{64}$/;
const SIGNATURE = /^0x[0-9a-fA-F]{130}$/;
const UNSIGNED_INTEGER = /^(0|[1-9][0-9]*)$/;
const SOURCE_DID = /^did:pkh:eip155:([1-9][0-9]*):(0x[0-9a-fA-F]{40})$/;

function requireAddress(actual: string, expected: Address, field: string): void {
  if (!isAddress(actual) || !isAddressEqual(actual, expected)) {
    throw new Error(`Payment credential ${field} does not match owner or terms`);
  }
}

function requirePattern(actual: string, pattern: RegExp, field: string): void {
  if (!pattern.test(actual)) throw new Error(`Payment credential ${field} is malformed`);
}

function parseUnsigned(actual: string, field: string): bigint {
  requirePattern(actual, UNSIGNED_INTEGER, field);
  return BigInt(actual);
}

function challengeResponse(challenge: Challenge.Challenge): Response {
  return new Response(null, {
    status: 402,
    headers: { "WWW-Authenticate": Challenge.serialize(challenge) },
  });
}

export async function validatePaymentCredential(
  request: Request,
  expected: ExpectedPaymentAuthorization,
  nowSec: number,
) {
  const credential = Credential.fromRequest(request);
  const payload = chargeSchema.schema.credential.payload.parse(credential.payload);
  if (payload.type !== "transaction") {
    throw new Error("Payment credential must use transaction mode");
  }
  const authorization = payload.authorization;
  if (authorization.type !== "eip-3009") {
    throw new Error("Payment credential must use EIP-3009");
  }

  const validated = validatePaymentChallenge(
    challengeResponse(credential.challenge),
    expected,
    nowSec,
  );
  const source = credential.source?.match(SOURCE_DID);
  if (!source || source[1] !== `${validated.terms.paymentChainId}`) {
    throw new Error("Payment credential source DID does not match payment chain");
  }
  requireAddress(source[2] ?? "", validated.owner, "source owner");

  requireAddress(authorization.from, validated.owner, "primary from");
  requireAddress(authorization.to, validated.recipient, "primary to");
  if (authorization.value !== validated.recipientAmount) {
    throw new Error("Payment credential primary value does not match net amount");
  }
  requirePattern(authorization.nonce, BYTES32, "primary nonce");
  requirePattern(authorization.signature, SIGNATURE, "primary signature");
  const usedNonces = new Set([authorization.nonce.toLowerCase()]);

  const validAfter = parseUnsigned(authorization.validAfter, "primary validAfter");
  const validBefore = parseUnsigned(authorization.validBefore, "primary validBefore");
  if (validBefore !== BigInt(validated.terms.expiresAt)) {
    throw new Error("Payment credential validBefore does not match payment expiry");
  }
  if (validAfter > BigInt(nowSec) || BigInt(nowSec) >= validBefore) {
    throw new Error("Payment credential validity window is not currently valid");
  }

  const splits = authorization.splits ?? [];
  if (splits.length !== validated.terms.splits.length) {
    throw new Error("Payment credential split count does not match terms");
  }
  for (const [index, split] of splits.entries()) {
    const expectedSplit = validated.terms.splits[index];
    if (!expectedSplit) throw new Error("Payment credential contains an unexpected split");
    requireAddress(split.from, validated.owner, `split ${index} from`);
    requireAddress(split.to, expectedSplit.recipient, `split ${index} to`);
    if (split.value !== expectedSplit.amount) {
      throw new Error(`Payment credential split ${index} value does not match terms`);
    }
    if (
      split.validAfter !== authorization.validAfter
      || split.validBefore !== authorization.validBefore
    ) {
      throw new Error(`Payment credential split ${index} validity window differs`);
    }
    parseUnsigned(split.validAfter, `split ${index} validAfter`);
    parseUnsigned(split.validBefore, `split ${index} validBefore`);
    requirePattern(split.nonce, BYTES32, `split ${index} nonce`);
    const normalizedNonce = split.nonce.toLowerCase();
    if (usedNonces.has(normalizedNonce)) {
      throw new Error("Payment credential EIP-3009 nonces must be unique");
    }
    usedNonces.add(normalizedNonce);
    requirePattern(split.signature, SIGNATURE, `split ${index} signature`);
  }

  await requireEip3009OwnerSignature(authorization, validated.owner, validated.terms);
  for (const split of splits) {
    await requireEip3009OwnerSignature(split, validated.owner, validated.terms);
  }

  return {
    credential,
    terms: validated.terms,
    owner: validated.owner,
    authorization,
  };
}
