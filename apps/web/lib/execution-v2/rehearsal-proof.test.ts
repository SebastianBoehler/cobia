import { keccak256, toHex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { describe, expect, it } from "vitest";
import {
  buildExecutionRehearsalProof,
  executionRehearsalCommitment,
  verifyExecutionRehearsalProof,
} from "./rehearsal-proof";

const owner = privateKeyToAccount(keccak256(toHex("cobia-rehearsal-owner")));
const other = privateKeyToAccount(keccak256(toHex("cobia-rehearsal-other")));
const nowSec = 2_000_000_000;
const routeId = `0x${"ab".repeat(32)}` as const;
const bundleHash = `0x${"bc".repeat(32)}` as const;
const nonce = `0x${"cd".repeat(32)}` as const;

function proof() {
  return buildExecutionRehearsalProof({
    realm: "localhost:3000",
    routeId,
    bundleHash,
    buyer: owner.address,
    executionChainId: 196,
    nonce,
    expiresAt: nowSec + 240,
  });
}

async function signature() {
  return owner.signMessage({ message: { raw: executionRehearsalCommitment(proof()) } });
}

describe("execution rehearsal proof", () => {
  it("normalizes the buyer and verifies a short-lived raw commitment", async () => {
    const signed = proof();
    expect(signed).toMatchObject({
      version: 1,
      domain: "cobia.execution.rehearsal.v1",
      buyer: owner.address.toLowerCase(),
      executionChainId: 196,
      nonce,
    });
    await expect(verifyExecutionRehearsalProof(signed, await signature(), nowSec))
      .resolves.toEqual(signed);
  });

  it.each([
    ["realm", { realm: "attacker.example" }],
    ["route", { routeId: `0x${"01".repeat(32)}` }],
    ["bundle", { bundleHash: `0x${"02".repeat(32)}` }],
    ["buyer", { buyer: other.address.toLowerCase() }],
    ["chain", { executionChainId: 1952 }],
    ["nonce", { nonce: `0x${"03".repeat(32)}` }],
    ["expiry", { expiresAt: nowSec + 239 }],
  ])("rejects a mutated %s", async (_label, mutation) => {
    await expect(verifyExecutionRehearsalProof(
      { ...proof(), ...mutation },
      await signature(),
      nowSec,
    )).rejects.toThrow();
  });

  it("rejects the expiry boundary and an overlong proof", async () => {
    const signed = proof();
    const signedSignature = await signature();
    await expect(verifyExecutionRehearsalProof(
      signed,
      signedSignature,
      signed.expiresAt,
    )).rejects.toThrow("expired");
    const tooLong = buildExecutionRehearsalProof({
      ...signed,
      expiresAt: nowSec + 301,
    });
    const tooLongSignature = await owner.signMessage({
      message: { raw: executionRehearsalCommitment(tooLong) },
    });
    await expect(verifyExecutionRehearsalProof(tooLong, tooLongSignature, nowSec))
      .rejects.toThrow("too long-lived");
  });

  it("rejects a signature from a wallet other than the buyer", async () => {
    const otherSignature = await other.signMessage({
      message: { raw: executionRehearsalCommitment(proof()) },
    });
    await expect(verifyExecutionRehearsalProof(proof(), otherSignature, nowSec))
      .rejects.toThrow("does not match buyer");
  });
});
