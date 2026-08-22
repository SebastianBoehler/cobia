import { describe, expect, it } from "vitest";
import { INTENT_ASSETS, NATIVE_INTENT_ASSET } from "./capability-templates";
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
    const policy = buildOpenIntentPolicyV3({
      ...common, templateId: "rwa-acquisition",
      inputToken: "0x779ded0c9e1022225f8e0630b35a9b54be713736",
      outputToken: "0x45804880de22913dafe09f4980848ece6ecbaf78",
      minimumOutputAtomic: "1000000000000000", outputChainId: 1,
    });

    expect(policy).toMatchObject({
      executionChainIds: [1, 196],
      inputs: [{ chainId: 196, token: "0x779ded0c9e1022225f8e0630b35a9b54be713736", maximumAtomic: "10000000" }],
      outcomes: [{ kind: "minimum-increase", chainId: 1,
        token: "0x45804880de22913dafe09f4980848ece6ecbaf78",
        atomic: "1000000000000000" }],
    });
    expect(JSON.stringify(policy)).not.toContain("jurisdiction");
    expect(JSON.stringify(policy)).not.toContain("eligibilityAttested");
  });

  it("bounds native OKB value for an RWA acquisition", () => {
    const policy = buildOpenIntentPolicyV3({
      ...common, templateId: "rwa-acquisition", inputToken: NATIVE_INTENT_ASSET.address,
      inputAtomic: "5000000000000000",
      outputToken: "0x96f6ef951840721adbf46ac996b59e0235cb985c",
      minimumOutputAtomic: "396000000000000000", outputChainId: 1,
    });

    expect(policy.inputs).toEqual([{ chainId: 196, token: NATIVE_INTENT_ASSET.address,
      maximumAtomic: "5000000000000000" }]);
    expect(policy.limits.maxNativeValueAtomicByChain).toEqual([
      { chainId: 1, atomic: "0" },
      { chainId: 196, atomic: "5000000000000000" },
    ]);
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
