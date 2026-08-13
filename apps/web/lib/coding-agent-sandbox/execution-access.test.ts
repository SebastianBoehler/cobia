import { privateKeyToAccount } from "viem/accounts";
import { keccak256, toHex } from "viem";
import { describe, expect, it } from "vitest";
import {
  buildAgentExecutionAccessProof,
  verifyAgentExecutionAccessProof,
} from "./execution-access";

const account = privateKeyToAccount(keccak256(toHex("agent-access-owner")));

describe("agent execution access proof", () => {
  it("binds owner, program, nonce, realm, and a short expiry", async () => {
    const proof = buildAgentExecutionAccessProof({
      programId: "550e8400-e29b-41d4-a716-446655440000",
      owner: account.address,
      realm: "cobia.example",
      nonce: `0x${"11".repeat(32)}`,
      expiresAt: 1_000,
    });
    const signature = await account.signMessage({ message: { raw: proof.commitment } });
    await expect(verifyAgentExecutionAccessProof({ proof, signature, nowSec: 900 }))
      .resolves.toEqual(proof);
    await expect(verifyAgentExecutionAccessProof({
      proof: { ...proof, programId: crypto.randomUUID() }, signature, nowSec: 900,
    })).rejects.toThrow("commitment");
    await expect(verifyAgentExecutionAccessProof({ proof, signature, nowSec: 1_001 }))
      .rejects.toThrow("expired");
  });
});
