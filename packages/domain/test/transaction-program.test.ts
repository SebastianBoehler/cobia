import { describe, expect, it } from "vitest";
import {
  parseTransactionProgramV1,
  TransactionProgramV1Schema,
  transactionProgramCommitmentV1,
} from "../src/index";

const owner = "0x1111111111111111111111111111111111111111";
const usdt0 = "0x2222222222222222222222222222222222222222";
const usdc = "0x3333333333333333333333333333333333333333";
const spacex = "0x4444444444444444444444444444444444444444";
const lifi = "0x5555555555555555555555555555555555555555";
const hash = (byte: string) => `0x${byte.repeat(64)}`;

const bridge = {
  id: "01-bridge",
  kind: "wallet-transaction" as const,
  chainId: 196 as const,
  dependsOn: [],
  provider: "lifi@1",
  quoteHash: hash("1"),
  responseHash: hash("2"),
  fetchedAt: 1_999_999_900,
  expiresAt: 2_000_000_200,
  sender: owner,
  recipient: owner,
  input: { token: usdt0, atomic: "10000000" },
  output: { chainId: 1 as const, token: usdc, minimumAtomic: "9800000" },
  approval: { token: usdt0, spender: lifi, maximumAtomic: "10000000" },
  transaction: {
    target: lifi,
    selector: "0x4c279d6b",
    dataHash: hash("3"),
    valueAtomic: "0",
  },
  tools: ["feeCollection", "layerswap"],
};

const delivery = {
  id: "02-delivery",
  kind: "async-delivery" as const,
  chainId: 1 as const,
  dependsOn: [bridge.id],
  provider: "lifi@1",
  sourceStageId: bridge.id,
  recipient: owner,
  output: { token: usdc, minimumAtomic: "9800000" },
  maximumWaitSec: 3_600,
};

const acquisition = {
  id: "03-acquire",
  kind: "wallet-transaction" as const,
  chainId: 1 as const,
  dependsOn: [delivery.id],
  provider: "lifi@1",
  quoteHash: hash("4"),
  responseHash: hash("5"),
  fetchedAt: 1_999_999_950,
  expiresAt: 2_000_000_200,
  sender: owner,
  recipient: owner,
  input: { token: usdc, atomic: "9800000" },
  output: { chainId: 1 as const, token: spacex, minimumAtomic: "60000000000000000" },
  approval: { token: usdc, spender: lifi, maximumAtomic: "9800000" },
  transaction: {
    target: lifi,
    selector: "0x5fd9ae2e",
    dataHash: hash("6"),
    valueAtomic: "0",
  },
  tools: ["feeCollection", "sushiswap"],
};

const program = {
  version: 1 as const,
  programId: "550e8400-e29b-41d4-a716-446655440091",
  requestId: "550e8400-e29b-41d4-a716-446655440090",
  policyHash: hash("a"),
  owner,
  createdAt: 1_999_999_800,
  deadline: 2_000_000_300,
  maxEvidenceAgeSec: 300,
  stages: [bridge, delivery, acquisition],
};

describe("canonical transaction programs", () => {
  it("accepts an ordered bridge and acquisition program", () => {
    const parsed = parseTransactionProgramV1(program, 2_000_000_000);

    expect(parsed.stages.map(({ id }) => id)).toEqual(["01-bridge", "02-delivery", "03-acquire"]);
    expect(transactionProgramCommitmentV1(parsed)).toMatch(/^0x[0-9a-f]{64}$/);
  });

  it("rejects unknown authority and signing fields", () => {
    expect(TransactionProgramV1Schema.safeParse({ ...program, privateKey: hash("f") }).success).toBe(false);
    expect(TransactionProgramV1Schema.safeParse({
      ...program,
      stages: [{ ...bridge, walletProvider: "window.ethereum" }, delivery, acquisition],
    }).success).toBe(false);
  });

  it("rejects duplicate, unsorted, and forward dependencies", () => {
    expect(TransactionProgramV1Schema.safeParse({ ...program, stages: [bridge, bridge] }).success).toBe(false);
    expect(TransactionProgramV1Schema.safeParse({ ...program, stages: [delivery, bridge, acquisition] }).success).toBe(false);
    expect(TransactionProgramV1Schema.safeParse({
      ...program,
      stages: [{ ...bridge, dependsOn: [delivery.id] }, delivery, acquisition],
    }).success).toBe(false);
  });

  it("binds every owner-controlled recipient to the program owner", () => {
    const other = "0x9999999999999999999999999999999999999999";
    expect(TransactionProgramV1Schema.safeParse({
      ...program,
      stages: [{ ...bridge, recipient: other }, delivery, acquisition],
    }).success).toBe(false);
    expect(TransactionProgramV1Schema.safeParse({
      ...program,
      stages: [bridge, { ...delivery, recipient: other }, acquisition],
    }).success).toBe(false);
  });

  it("rejects dirty identities and unsafe atomic values", () => {
    expect(TransactionProgramV1Schema.safeParse({ ...program, owner: owner.toUpperCase() }).success).toBe(false);
    expect(TransactionProgramV1Schema.safeParse({
      ...program,
      stages: [{ ...bridge, input: { ...bridge.input, atomic: "01" } }, delivery, acquisition],
    }).success).toBe(false);
  });

  it("rejects stale or expired evidence at preparation time", () => {
    expect(() => parseTransactionProgramV1(program, 2_000_000_201)).toThrow(/expired/i);
    expect(() => parseTransactionProgramV1({
      ...program,
      stages: [{ ...bridge, fetchedAt: 1_999_999_600 }, delivery, acquisition],
    }, 2_000_000_000)).toThrow(/stale/i);
  });

  it("keeps research stages structurally non-executable", () => {
    const research = {
      id: "01-research",
      kind: "research" as const,
      chainId: 196 as const,
      dependsOn: [],
      plugin: "unknown.protocol@1",
      sourceHash: hash("9"),
      reasonCode: "CAPABILITY_NOT_REGISTERED",
      executable: true,
    };
    expect(TransactionProgramV1Schema.safeParse({ ...program, stages: [research] }).success).toBe(false);
  });
});
