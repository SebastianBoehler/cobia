import type {
  CompiledCapabilityActionV1,
  CapabilityProgramV1,
} from "../src";
import { verifyCapabilityAssetFlowV1 } from "../src";
import { describe, expect, it } from "vitest";

const owner = "0x1111111111111111111111111111111111111111";
const executor = "0x2222222222222222222222222222222222222222";
const inputToken = "0x3333333333333333333333333333333333333333";
const outputToken = "0x4444444444444444444444444444444444444444";
const positionToken = "0x5555555555555555555555555555555555555555";

function program(constraints: CapabilityProgramV1["constraints"]): CapabilityProgramV1 {
  return {
    version: 1,
    requestId: "b1946b6f-aad8-45a6-96dd-d138b55c7710",
    chainId: 196,
    policyHash: `0x${"11".repeat(32)}`,
    manifestHash: `0x${"22".repeat(32)}`,
    owner,
    executor,
    pinnedBlock: { number: "123456", hash: `0x${"33".repeat(32)}` },
    deadline: 2_000_000_000,
    nonce: `0x${"44".repeat(32)}`,
    input: { token: inputToken, atomic: "50000000" },
    actions: [
      { capabilityId: "swap.exact", capabilityVersion: 1, valueAtomic: "0", parameters: {} },
      { capabilityId: "lend.supply", capabilityVersion: 1, valueAtomic: "0", parameters: {} },
    ],
    constraints,
  };
}

function action(input: Partial<CompiledCapabilityActionV1>): CompiledCapabilityActionV1 {
  return {
    capabilityId: "swap.exact",
    capabilityVersion: 1,
    target: "0x6666666666666666666666666666666666666666",
    selector: "0x12345678",
    data: "0x12345678",
    spend: [],
    guaranteedOutputs: [],
    deployments: [],
    evidencePredicates: [],
    ...input,
  };
}

describe("capability asset-flow verification", () => {
  it("accepts swap-to-position composition funded only by guaranteed output", () => {
    const candidate = program([{
      token: positionToken,
      account: owner,
      minimumIncreaseAtomic: "48999999",
    }]);
    const result = verifyCapabilityAssetFlowV1(candidate, [
      action({
        spend: [{ token: inputToken, atomic: "50000000" }],
        guaranteedOutputs: [{
          token: outputToken, account: executor, minimumIncreaseAtomic: "49000000",
        }],
      }),
      action({
        capabilityId: "lend.supply",
        spend: [{ token: outputToken, atomic: "49000000" }],
        guaranteedOutputs: [{
          token: positionToken, account: owner, minimumIncreaseAtomic: "48999999",
        }],
      }),
    ]);

    expect(result).toEqual({ accepted: true, errorCodes: [], guaranteedOwnerDeltas: [{
      token: positionToken,
      atomic: "48999999",
    }] });
  });

  it("rejects spending more than an earlier action guarantees", () => {
    const candidate = program([{
      token: positionToken, account: owner, minimumIncreaseAtomic: "1",
    }]);
    const result = verifyCapabilityAssetFlowV1(candidate, [
      action({
        spend: [{ token: inputToken, atomic: "50000000" }],
        guaranteedOutputs: [{
          token: outputToken, account: executor, minimumIncreaseAtomic: "49000000",
        }],
      }),
      action({
        capabilityId: "lend.supply",
        spend: [{ token: outputToken, atomic: "49000001" }],
        guaranteedOutputs: [{
          token: positionToken, account: owner, minimumIncreaseAtomic: "1",
        }],
      }),
    ]);

    expect(result.errorCodes).toContain("INSUFFICIENT_GUARANTEED_BALANCE");
  });

  it("derives round-trip profit after subtracting the original principal", () => {
    const candidate: CapabilityProgramV1 = {
      ...program([{ token: inputToken, account: owner, minimumIncreaseAtomic: "1000000" }]),
      input: { token: inputToken, atomic: "50000000" },
      actions: [
        { capabilityId: "swap.exact", capabilityVersion: 1, valueAtomic: "0" as const, parameters: {} },
        { capabilityId: "swap.exact", capabilityVersion: 1, valueAtomic: "0" as const, parameters: {} },
      ],
    };
    const result = verifyCapabilityAssetFlowV1(candidate, [
      action({
        spend: [{ token: inputToken, atomic: "50000000" }],
        guaranteedOutputs: [{
          token: outputToken, account: executor, minimumIncreaseAtomic: "49000000",
        }],
      }),
      action({
        capabilityId: "swap.exact",
        spend: [{ token: outputToken, atomic: "49000000" }],
        guaranteedOutputs: [{
          token: inputToken, account: executor, minimumIncreaseAtomic: "51000000",
        }],
      }),
    ]);

    expect(result.guaranteedOwnerDeltas).toEqual([{ token: inputToken, atomic: "1000000" }]);
    expect(result.accepted).toBe(true);
  });

  it("rejects constraints for an account other than the intent owner", () => {
    const candidate = program([{
      token: outputToken,
      account: "0x9999999999999999999999999999999999999999",
      minimumIncreaseAtomic: "1",
    }]);
    const result = verifyCapabilityAssetFlowV1(candidate, []);
    expect(result.errorCodes).toContain("CONSTRAINT_ACCOUNT_MISMATCH");
  });
});
