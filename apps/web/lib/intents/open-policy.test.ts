import { describe, expect, it } from "vitest";
import { INTENT_ASSETS } from "./capability-templates";
import { buildOpenIntentPolicyV3 } from "./open-policy";

const common = {
  requestId: "550e8400-e29b-41d4-a716-446655440000",
  owner: "0x1111111111111111111111111111111111111111" as const,
  inputToken: INTENT_ASSETS[0].address,
  inputAtomic: "10000000",
  nonce: `0x${"22".repeat(32)}` as const,
  nowSec: 2_000_000_000,
  displayGoal: "Get the best verified outcome",
  competitionDurationSec: 300,
};

describe("open intent policy builder", () => {
  it("expresses outcomes without binding solvers to protocols", () => {
    const policy = buildOpenIntentPolicyV3({
      ...common, templateId: "exact-input-swap",
      outputToken: INTENT_ASSETS[1].address, minimumOutputAtomic: "9950000",
    });

    expect(policy).toMatchObject({
      version: 3, kind: "open-onchain", executionChainIds: [196],
      outcomes: [{ kind: "minimum-increase", atomic: "9950000" }],
    });
    expect(policy).not.toHaveProperty("allowedCapabilities");
    expect(policy).not.toHaveProperty("manifestHash");
  });

  it("keeps input, time, gas, approval, and native-value authority bounded", () => {
    const policy = buildOpenIntentPolicyV3({
      ...common, templateId: "round-trip", minimumProfitAtomic: "10000",
    });
    expect(policy.inputs).toEqual([{
      chainId: 196, token: common.inputToken.toLowerCase(), maximumAtomic: "10000000",
    }]);
    expect(policy.limits).toMatchObject({ maxTransactions: 4, maxApprovals: 4,
      maxNativeValueAtomicByChain: [{ chainId: 196, atomic: "0" }] });
    expect(policy.competition.closesAt).toBe(common.nowSec + 300);
  });
});
