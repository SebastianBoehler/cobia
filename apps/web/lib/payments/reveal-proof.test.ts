import { keccak256, toHex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { describe, expect, it } from "vitest";
import {
  RevealProofSchema,
  buildRevealProof,
  revealProofCommitment,
  verifyRevealProof,
  verifyRevealRecoveryProof,
} from "./reveal-proof";

const owner = privateKeyToAccount(keccak256(toHex("cobia-reveal-proof-owner")));
const other = privateKeyToAccount(keccak256(toHex("cobia-reveal-proof-other")));
const requestId = "550e8400-e29b-41d4-a716-446655440000";
const quoteId = `0x${"ab".repeat(32)}` as const;
const termsHash = "0x8d6bd3f70cb73a4659bcc87d3ec42d3719b353fdd39393bb984a9d253fd18a7b" as const;
const nonce = `0x${"cd".repeat(32)}` as const;

const context = {
  realm: "pay.cobia.example",
  requestId,
  quoteId,
  owner: owner.address,
  paymentChainId: 1952 as const,
  executionChainId: 196 as const,
  paymentTermsHash: termsHash,
  expiresAt: 2_000_000_000,
};

function proof() {
  return buildRevealProof({ ...context, nonce });
}

describe("reveal proof", () => {
  it("builds a strict lowercase-owner proof and fixed raw commitment", () => {
    expect(proof()).toEqual({
      version: 1,
      action: "cobia.reveal.v1",
      realm: "pay.cobia.example",
      requestId,
      quoteId,
      owner: "0x1f150b6cbc7004e49358cd7ee61580bca8d34b00",
      paymentChainId: 1952,
      executionChainId: 196,
      paymentTermsHash: termsHash,
      nonce,
      expiresAt: 2_000_000_000,
    });
    expect(revealProofCommitment(proof())).toBe(
      "0x3413fca6c3c1e782a5bb7a6692b0843be920f1985ce22bd01a4b2a1c467576bc",
    );
  });

  it("returns the owner-signed proof and exposes its nonce", async () => {
    const signature = await owner.signMessage({
      message: { raw: revealProofCommitment(proof()) },
    });

    await expect(verifyRevealProof(proof(), signature, context, 1_999_999_999))
      .resolves.toMatchObject({ owner: owner.address.toLowerCase(), nonce });
  });

  it.each([
    ["realm", { realm: "other.cobia.example" }],
    ["request", { requestId: "6ba7b810-9dad-11d1-80b4-00c04fd430c8" }],
    ["quote", { quoteId: `0x${"ef".repeat(32)}` }],
    ["owner", { owner: other.address.toLowerCase() }],
    ["payment chain", { paymentChainId: 196 }],
    ["execution chain", { executionChainId: 1952 }],
    ["terms hash", { paymentTermsHash: `0x${"01".repeat(32)}` }],
    ["nonce", { nonce: `0x${"02".repeat(32)}` }],
    ["expiry", { expiresAt: 2_000_000_001 }],
  ])("rejects a mutated %s", async (_name, mutation) => {
    const original = proof();
    const signature = await owner.signMessage({
      message: { raw: revealProofCommitment(original) },
    });

    await expect(verifyRevealProof(
      { ...original, ...mutation },
      signature,
      context,
      1_999_999_999,
    )).rejects.toThrow();
  });

  it("rejects a signature from anyone except the policy owner", async () => {
    const signature = await other.signMessage({
      message: { raw: revealProofCommitment(proof()) },
    });

    await expect(verifyRevealProof(proof(), signature, context, 1_999_999_999))
      .rejects.toThrow("does not match owner");
  });

  it("rejects an otherwise exact proof at its expiry", async () => {
    const signature = await owner.signMessage({
      message: { raw: revealProofCommitment(proof()) },
    });

    await expect(verifyRevealProof(proof(), signature, context, 2_000_000_000))
      .rejects.toThrow("expired");
  });

  it("requires a fresh, short-lived owner proof for paid recovery", async () => {
    const expired = proof();
    const expiredSignature = await owner.signMessage({
      message: { raw: revealProofCommitment(expired) },
    });
    await expect(verifyRevealRecoveryProof(expired, expiredSignature, context, 2_000_000_000))
      .rejects.toThrow("expired");

    const fresh = { ...proof(), expiresAt: 2_000_000_300 };
    const freshSignature = await owner.signMessage({ message: { raw: revealProofCommitment(fresh) } });
    await expect(verifyRevealRecoveryProof(fresh, freshSignature, context, 2_000_000_000))
      .resolves.toMatchObject({ owner: owner.address.toLowerCase(), expiresAt: 2_000_000_300 });
    const tooLong = { ...fresh, expiresAt: 2_000_000_301 };
    const tooLongSignature = await owner.signMessage({ message: { raw: revealProofCommitment(tooLong) } });
    await expect(verifyRevealRecoveryProof(tooLong, tooLongSignature, context, 2_000_000_000))
      .rejects.toThrow("too long-lived");
  });

  it.each([
    { ...proof(), action: "cobia.reveal.v2" },
    { ...proof(), owner: owner.address },
    { ...proof(), nonce: "0x01" },
    { ...proof(), unexpected: true },
  ])("rejects malformed serialized proof %#", (value) => {
    expect(RevealProofSchema.safeParse(value).success).toBe(false);
  });
});
