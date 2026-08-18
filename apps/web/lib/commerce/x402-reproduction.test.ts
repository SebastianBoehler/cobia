import { commitment } from "@cobia/domain";
import { describe, expect, it } from "vitest";
import { X402AuthorizationPlanV1Schema } from "./x402-plan";
import { reproduceX402PlanV1 } from "./x402-reproduction";

const hash = (byte: string) => `0x${byte.repeat(64)}` as `0x${string}`;
const plan = X402AuthorizationPlanV1Schema.parse({
  version: 1, chainId: 196, offerCommitment: hash("1"), policyHash: hash("2"),
  programHash: hash("3"), owner: "0x1111111111111111111111111111111111111111",
  payee: "0x2222222222222222222222222222222222222222",
  asset: "0x3333333333333333333333333333333333333333", amount: "10000",
  endpoint: "https://api.example/resource", facilitator: "https://facilitator.example",
  maxTimeoutSec: 60, offerExpiresAt: 2_000_000_120, programDeadline: 2_000_000_180,
  authorizationNonce: hash("4"),
  token: { runtimeCodeHash: hash("5"), eip712Name: "USD Coin", eip712Version: "2" },
  settlement: {
    topic0: "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef",
    fromTopicIndex: 1, toTopicIndex: 2,
  },
});

describe("trusted x402 pre-authorization reproduction", () => {
  it("commits the exact static plan and required settlement evidence", () => {
    const result = reproduceX402PlanV1(plan);
    expect(result).toMatchObject({ reproduced: true, compiledActionHash: commitment(plan) });
    expect(Object.values(result)).not.toContain(hash("0"));
    expect(reproduceX402PlanV1(plan)).toEqual(result);
  });

  it("changes evidence when any payment or receipt bound changes", () => {
    const original = reproduceX402PlanV1(plan);
    const changedAmount = reproduceX402PlanV1({ ...plan, amount: "10001" });
    const changedPayee = reproduceX402PlanV1({
      ...plan, payee: "0x4444444444444444444444444444444444444444",
    });
    expect(changedAmount).not.toEqual(original);
    expect(changedPayee).not.toEqual(original);
  });

  it("rejects non-canonical or non-X-Layer plans", () => {
    expect(() => reproduceX402PlanV1({ ...plan, chainId: 1 })).toThrow();
    expect(() => reproduceX402PlanV1({ ...plan, endpoint: "http://api.example" })).toThrow();
  });
});
