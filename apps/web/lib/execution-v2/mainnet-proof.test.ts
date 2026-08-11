import { keccak256, toHex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { describe, expect, it } from "vitest";
import {
  buildExecutionMainnetProof,
  executionMainnetCommitment,
  verifyExecutionMainnetProof,
} from "./mainnet-proof";

const buyer = privateKeyToAccount(keccak256(toHex("cobia-mainnet-buyer")));
const other = privateKeyToAccount(keccak256(toHex("cobia-mainnet-other")));
const nowSec = 2_000_000_000;

function proof() {
  return buildExecutionMainnetProof({
    realm: "localhost:3000",
    routeId: `0x${"11".repeat(32)}`,
    bundleHash: `0x${"11".repeat(32)}`,
    buyer: buyer.address,
    executionChainId: 196,
    rehearsalTraceHash: `0x${"22".repeat(32)}`,
    nonce: `0x${"33".repeat(32)}`,
    expiresAt: nowSec + 240,
  });
}

async function signature() {
  return buyer.signMessage({ message: { raw: executionMainnetCommitment(proof()) } });
}

describe("mainnet execution owner proof", () => {
  it("normalizes and verifies a short-lived action-scoped raw commitment", async () => {
    const signed = proof();
    expect(signed).toMatchObject({
      version: 1,
      domain: "cobia.execution.mainnet.v1",
      buyer: buyer.address.toLowerCase(),
      executionChainId: 196,
    });
    await expect(verifyExecutionMainnetProof(signed, await signature(), nowSec))
      .resolves.toEqual(signed);
  });

  it.each([
    ["realm", { realm: "attacker.example" }],
    ["route", { routeId: `0x${"44".repeat(32)}` }],
    ["bundle", { bundleHash: `0x${"55".repeat(32)}` }],
    ["buyer", { buyer: other.address.toLowerCase() }],
    ["chain", { executionChainId: 1952 }],
    ["rehearsal", { rehearsalTraceHash: `0x${"66".repeat(32)}` }],
    ["nonce", { nonce: `0x${"77".repeat(32)}` }],
    ["expiry", { expiresAt: nowSec + 239 }],
  ])("rejects a mutated %s", async (_label, mutation) => {
    await expect(verifyExecutionMainnetProof(
      { ...proof(), ...mutation },
      await signature(),
      nowSec,
    )).rejects.toThrow();
  });

  it("rejects expiry, overlong authority, and another signer", async () => {
    const signed = proof();
    await expect(verifyExecutionMainnetProof(signed, await signature(), signed.expiresAt))
      .rejects.toThrow("expired");
    const long = buildExecutionMainnetProof({ ...signed, expiresAt: nowSec + 301 });
    const longSignature = await buyer.signMessage({
      message: { raw: executionMainnetCommitment(long) },
    });
    await expect(verifyExecutionMainnetProof(long, longSignature, nowSec))
      .rejects.toThrow("too long-lived");
    const otherSignature = await other.signMessage({
      message: { raw: executionMainnetCommitment(signed) },
    });
    await expect(verifyExecutionMainnetProof(signed, otherSignature, nowSec))
      .rejects.toThrow("does not match buyer");
  });
});
