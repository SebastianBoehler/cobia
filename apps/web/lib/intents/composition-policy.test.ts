import { commitment } from "@cobia/domain";
import type { Address } from "viem";
import { describe, expect, it } from "vitest";
import { PROTOCOL_REGISTRY } from "../adapters/registry";
import { productionCapabilityManifestV1 } from "../capabilities/manifest";
import { buildCapabilityCompositionPolicyV1 } from "./composition-policy";

const owner = "0x1111111111111111111111111111111111111111" as Address;
const input = PROTOCOL_REGISTRY.aaveV3.assets.USDG.underlying.address;

describe("buildCapabilityCompositionPolicyV1", () => {
  it("builds the exact ten-minute registered yield authority", () => {
    const policy = buildCapabilityCompositionPolicyV1({
      requestId: "550e8400-e29b-41d4-a716-446655440099",
      owner,
      inputToken: input,
      inputAtomic: "1000000",
      nonce: `0x${"11".repeat(32)}`,
      nowSec: 2_000_000_000,
      displayGoal: "Enter the best verified stablecoin-yield route",
      competitionDurationSec: 300,
      deadlineDurationSec: 600,
      maxConversionLossBps: 100,
      minimumReceiptValueBps: 9_900,
      horizonDays: 30,
      forbiddenTargets: [],
    });

    expect(policy).toMatchObject({
      kind: "capability-composition",
      input: { token: input.toLowerCase(), maxAtomic: "1000000" },
      competition: { closesAt: 2_000_000_300 },
      deadline: 2_000_000_600,
      objective: { kind: "maximize-net-yield", horizonDays: 30 },
      constraints: [
        { kind: "maximum-conversion-loss", maximumLossBps: 100 },
        { kind: "minimum-registered-receipt-value", minimumValueBps: 9_900 },
      ],
    });
    expect(policy.allowedCapabilities.map(({ id }) => id)).toEqual([
      "aave-v3.supply",
      "curve-stableswap-ng.exact-input",
      "uniswap-v3.exact-input",
    ]);
    expect(policy.manifestHash).toBe(commitment(productionCapabilityManifestV1()));
  });

  it("rejects invalid competition, deadline, and economic bounds", () => {
    const common = {
      requestId: "550e8400-e29b-41d4-a716-446655440099", owner,
      inputToken: input, inputAtomic: "1000000", nonce: `0x${"11".repeat(32)}`,
      nowSec: 2_000_000_000, displayGoal: "Yield", competitionDurationSec: 300,
      deadlineDurationSec: 600, maxConversionLossBps: 100,
      minimumReceiptValueBps: 9_900, horizonDays: 30, forbiddenTargets: [],
    } satisfies Parameters<typeof buildCapabilityCompositionPolicyV1>[0];
    expect(() => buildCapabilityCompositionPolicyV1({
      ...common, competitionDurationSec: 601,
    })).toThrow(/competition/i);
    expect(() => buildCapabilityCompositionPolicyV1({
      ...common, maxConversionLossBps: 501,
    })).toThrow(/basis|500|loss/i);
    expect(() => buildCapabilityCompositionPolicyV1({
      ...common, horizonDays: 0,
    })).toThrow(/day|positive|small/i);
  });
});
