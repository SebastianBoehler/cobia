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
  maxSolverFeeAtomic: "100000",
  forbiddenTargets: [],
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
      maxSolverFeeAtomic: "100000",
      maxNativeValueAtomicByChain: [{ chainId: 196, atomic: "0" }] });
    expect(policy.competition.closesAt).toBe(common.nowSec + 300);
  });

  it("binds an RWA request to a registered instrument without choosing a route", () => {
    const instrumentCommitment = `0x${"44".repeat(32)}` as const;
    const policy = buildOpenIntentPolicyV3({
      ...common, templateId: "rwa-acquisition",
      inputToken: "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48",
      outputToken: "0x45804880de22913dafe09f4980848ece6ecbaf78",
      minimumOutputAtomic: "1000000000000000", instrumentCommitment, jurisdiction: "CH",
      instrumentChainId: 1,
    });

    expect(policy).toMatchObject({
      executionChainIds: [1, 196],
      inputs: [{ chainId: 1, maximumAtomic: "10000000" }],
      outcomes: [{ kind: "registered-instrument", chainId: 1,
        token: "0x45804880de22913dafe09f4980848ece6ecbaf78",
        minimumIncreaseAtomic: "1000000000000000", instrumentCommitment,
        jurisdiction: "CH", eligibilityAttested: true }],
    });
    expect(policy).not.toHaveProperty("provider");
  });

  it("binds an X Layer instrument to its exact token balance outcome", () => {
    const instrumentCommitment = `0x${"55".repeat(32)}` as const;
    const policy = buildOpenIntentPolicyV3({
      ...common, templateId: "rwa-acquisition", instrumentChainId: 196,
      outputToken: "0x8ad3c73f833d3f9a523ab01476625f269aeb7cf0",
      minimumOutputAtomic: "10000000000000000", instrumentCommitment, jurisdiction: "DE",
    });

    expect(policy).toMatchObject({
      executionChainIds: [196],
      inputs: [{ chainId: 196, token: common.inputToken.toLowerCase() }],
      outcomes: [{ kind: "registered-instrument", chainId: 196,
        token: "0x8ad3c73f833d3f9a523ab01476625f269aeb7cf0",
        minimumIncreaseAtomic: "10000000000000000", instrumentCommitment }],
    });
  });
});
