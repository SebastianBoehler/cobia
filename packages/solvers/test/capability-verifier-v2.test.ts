import { commitment } from "@cobia/domain";
import { describe, expect, it } from "vitest";
import { verifyCapabilityProgramV2 } from "../src";
import {
  evidence, executor, manifestHash, owner, policy, program, read, registry,
  replay, sideToken, snapshot, staticCaller, target,
} from "./capability-v2-fixtures";

function verify(overrides: Partial<Parameters<typeof verifyCapabilityProgramV2>[0]> = {}) {
  const candidate = overrides.program ?? program();
  return verifyCapabilityProgramV2({
    policy,
    wallet: owner,
    executor,
    snapshot,
    manifest: { manifestHash },
    program: candidate,
    evidence: overrides.evidence ?? evidence(),
    registry,
    nowSec: 1_999_999_950,
    staticCaller,
    confirmAnchor: async () => true,
    replay: overrides.replay ?? replay(),
    ...overrides,
  });
}

describe("general capability verifier", () => {
  it("accepts only after a canonical anchor and exact independent replay", async () => {
    const reproduce = replay();
    const result = await verify({ replay: reproduce });
    expect(result).toMatchObject({ accepted: true, errorCodes: [], replay: { reproduced: true } });
    expect(reproduce).toHaveBeenCalledOnce();
  });

  it.each([
    ["wallet", "0x7777777777777777777777777777777777777777", "POLICY_MISMATCH"],
    ["executor", "0x7777777777777777777777777777777777777777", "POLICY_MISMATCH"],
    ["nowSec", policy.deadline + 1, "STALE_EVIDENCE"],
  ] as const)("rejects changed %s", async (field, value, code) => {
    const reproduce = replay();
    const result = await verify({ [field]: value, replay: reproduce });
    expect(result.errorCodes).toContain(code);
    expect(reproduce).not.toHaveBeenCalled();
  });

  it("rejects chain, nonce, manifest, input, and exact outcome expansion", async () => {
    const mutations = [
      { chainId: 1952 },
      { nonce: `0x${"ab".repeat(32)}` },
      { manifestHash: `0x${"bc".repeat(32)}` },
      { input: { token: policy.input.token, atomic: "11" } },
      { predicates: [] },
      { objective: { kind: "satisfy" } },
    ];
    for (const mutation of mutations) {
      const candidate = { ...program(), ...mutation };
      const result = await verify({ program: candidate, evidence: evidence() });
      expect(result.accepted).toBe(false);
      expect(result.errorCodes).toEqual(expect.arrayContaining([
        mutation.chainId ? "CHAIN_MISMATCH" : "POLICY_MISMATCH",
      ]));
    }
  });

  it("enforces capability, target, asset, calldata, approval, and gas limits", async () => {
    const deniedPolicy = { ...policy, allowedCapabilities: [{ id: "other.deposit", version: 1 }] };
    expect((await verify({ policy: deniedPolicy })).errorCodes).toContain("CAPABILITY_NOT_ALLOWED");

    const forbiddenTargetPolicy = { ...policy, forbiddenTargets: [target] };
    expect((await verify({ policy: forbiddenTargetPolicy })).errorCodes).toContain("FORBIDDEN_TARGET");

    const forbiddenAssetPolicy = { ...policy, forbiddenAssets: [sideToken] };
    expect((await verify({ policy: forbiddenAssetPolicy })).errorCodes).toContain("FORBIDDEN_ASSET");

    const tight = { ...policy, limits: { ...policy.limits, maxActionCalldataBytes: 4, maxApprovals: 0, maxExpectedGas: 21_000 } };
    expect((await verify({ policy: tight })).errorCodes).toEqual(expect.arrayContaining(["LIMIT_EXCEEDED"]));
  });

  it("rejects missing balances, deployment drift, and falsified observations", async () => {
    const cases = [
      [{ ...evidence(), balanceDeltas: [] }, "FINAL_BALANCE_TOO_LOW"],
      [{ ...evidence(), deployments: [] }, "TARGET_CODE_MISMATCH"],
      [{ ...evidence(), observations: [] }, "OBSERVATION_MISSING"],
      [{ ...evidence(), observations: [
        ...evidence().observations,
        { ...evidence().observations[0]!, readHash: `0x${"ef".repeat(32)}` as `0x${string}` },
      ] }, "CAPABILITY_EVIDENCE_INVALID"],
      [{ ...evidence(), observations: [{ ...evidence().observations[0]!, satisfied: false }] }, "PREDICATE_FALSE"],
      [{ ...evidence(), objective: { ...evidence().objective!, decodedValue: "10" } }, "OBJECTIVE_MISMATCH"],
    ] as const;
    for (const [changed, code] of cases) {
      const reproduce = replay();
      const result = await verify({ evidence: changed, replay: reproduce });
      expect(result.errorCodes).toContain(code);
      expect(reproduce).not.toHaveBeenCalled();
    }
  });

  it("maps independent pre-read failures to stable rejection codes", async () => {
    const before = { ...policy.predicates[0]!, phase: "before" as const };
    const beforePolicy = { ...policy, predicates: [before] };
    const candidate = { ...program(), policyHash: commitment(beforePolicy), predicates: [before] };
    const beforeEvidence = {
      ...evidence(),
      programHash: commitment(candidate),
      observations: [{ ...evidence().observations[0]!, phase: "before" as const, readHash: commitment(read) }],
    };
    const failures = [
      [{ getCodeHash: async () => `0x${"00".repeat(32)}` as `0x${string}`, call: staticCaller.call }, "STATIC_CALL_CODE_MISMATCH"],
      [{ getCodeHash: staticCaller.getCodeHash, call: async () => ({ success: false, returnData: "0x" as const }) }, "STATIC_CALL_FAILED"],
      [{ getCodeHash: staticCaller.getCodeHash, call: async () => ({ success: true, returnData: "0x01" as const }) }, "STATIC_RETURN_INVALID"],
    ] as const;
    for (const [caller, code] of failures) {
      const result = await verify({ policy: beforePolicy, program: candidate, evidence: beforeEvidence, staticCaller: caller });
      expect(result.errorCodes).toContain(code);
    }
  });

  it("rejects target code drift through RPC preflight before starting fork replay", async () => {
    const reproduce = replay();
    const result = await verify({
      staticCaller: {
        getCodeHash: async (address) =>
          address.toLowerCase() === target.toLowerCase() ? undefined : read.runtimeCodeHash,
        call: staticCaller.call,
      },
      replay: reproduce,
    });
    expect(result.errorCodes).toContain("TARGET_CODE_MISMATCH");
    expect(reproduce).not.toHaveBeenCalled();
  });

  it("rejects stale/reorganized anchors and any replay commitment change", async () => {
    expect((await verify({ confirmAnchor: async () => false })).errorCodes).toContain("ANCHOR_MISMATCH");
    expect((await verify({ confirmAnchor: async () => { throw new Error("RPC failed"); } })).errorCodes)
      .toContain("ANCHOR_MISMATCH");
    const changedReplay = async () => ({ ...await replay()(), eventsHash: `0x${"ff".repeat(32)}` as `0x${string}` });
    expect((await verify({ replay: changedReplay })).errorCodes).toContain("REPLAY_MISMATCH");
  });
});
