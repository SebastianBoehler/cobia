import { describe, expect, it } from "vitest";
import {
  assertExactStageTransaction,
  parseGeneralAssetExecutionBundleV4,
  type PreparedWalletStageTransactionV4,
  type WalletStageTransactionV4,
} from "./stage-artifact";

const hash = (byte: string) => `0x${byte.repeat(64)}` as `0x${string}`;
const owner = "0x1111111111111111111111111111111111111111" as const;
const inputToken = "0x2222222222222222222222222222222222222222" as const;
const outputToken = "0x3333333333333333333333333333333333333333" as const;
const executor = "0x4444444444444444444444444444444444444444" as const;

function transaction(overrides: Partial<WalletStageTransactionV4> = {}): WalletStageTransactionV4 {
  return { chainId: 196, from: owner, to: executor, value: "0x0",
    data: "0x12345678", ...overrides };
}

function bundle() {
  return {
    version: 4 as const,
    kind: "general-asset-execution" as const,
    programId: hash("1"),
    owner,
    deadline: 2_000_000_300,
    finalOutput: { chainId: 1 as const, token: outputToken, minimumAtomic: "90" },
    stages: [{
      stageId: hash("2"), ordinal: 0, chainId: 196 as const, predecessorStageId: null,
      inputToken, requiredConfirmations: 12, transaction: transaction(),
      expectedLogs: [{ address: executor, topics: [hash("3")], data: "0x" }],
      delivery: { kind: "bridge" as const, destinationChainId: 1 as const,
        recipient: owner, token: outputToken, minimumAtomic: "90" },
      evidenceHash: hash("4"),
    }, {
      stageId: hash("5"), ordinal: 1, chainId: 1 as const, predecessorStageId: hash("2"),
      inputToken: outputToken, requiredConfirmations: 15,
      transaction: transaction({ chainId: 1 }),
      expectedLogs: [{ address: executor, topics: [hash("6")], data: "0x" }],
      delivery: { kind: "none" as const }, evidenceHash: hash("7"),
    }],
  };
}

describe("general asset V4 execution artifact", () => {
  it("parses ordered exact stages and rejects owner or predecessor drift", () => {
    expect(parseGeneralAssetExecutionBundleV4(bundle()).stages[0]).toMatchObject({
      ordinal: 0, transaction: { chainId: 196, from: owner },
    });
    expect(() => parseGeneralAssetExecutionBundleV4({
      ...bundle(), stages: [{ ...bundle().stages[0], transaction: {
        ...transaction(), from: outputToken,
      } }],
    })).toThrow(/owner/i);
  });

  it.each([
    ["chainId", 1],
    ["from", outputToken],
    ["to", inputToken],
    ["value", "0x1"],
    ["data", "0x87654321"],
  ])("refuses a wallet transaction with changed %s", (field, value) => {
    expect(() => assertExactStageTransaction(transaction(), {
      ...transaction(), nonce: "7", [field]: value,
    } as PreparedWalletStageTransactionV4)).toThrow("does not match attestation");
  });

  it("accepts a fresh wallet nonce without changing the attested call", () => {
    expect(() => assertExactStageTransaction(transaction(), {
      ...transaction(), nonce: "7",
    })).not.toThrow();
  });
});
