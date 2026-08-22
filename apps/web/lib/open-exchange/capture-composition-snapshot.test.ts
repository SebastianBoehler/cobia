import { commitment } from "@cobia/domain";
import { describe, expect, it, vi } from "vitest";
import { buildCapabilityCompositionPolicyV1 } from "../intents/composition-policy";
import {
  block,
  dependencies as routeDependencies,
  usdt0,
} from "../orchestrator/capture-route-snapshot-v2.test-fixture";
import { captureCapabilityCompositionSnapshotV1 } from "./capture-composition-snapshot";

const policy = buildCapabilityCompositionPolicyV1({
  requestId: "550e8400-e29b-41d4-a716-446655440099",
  owner: "0x1111111111111111111111111111111111111111",
  inputToken: usdt0,
  inputAtomic: "1000000",
  nonce: `0x${"11".repeat(32)}`,
  nowSec: Number(block.timestamp) - 60,
  displayGoal: "Enter the best verified stablecoin yield route",
  competitionDurationSec: 300,
  deadlineDurationSec: 600,
  maxConversionLossBps: 100,
  minimumReceiptValueBps: 9_900,
  horizonDays: 30,
  forbiddenTargets: [],
});

function dependencies(priceUsd = "107.41") {
  return {
    route: routeDependencies(),
    getGasPrice: vi.fn(async () => 1_000_000_000n),
    getNativeToken: vi.fn(async () => ({
      chainId: 196 as const,
      token: "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee" as const,
      symbol: "OKB",
      decimals: 18,
      priceUsd,
    })),
  };
}

describe("composition snapshot capture", () => {
  it("pins registered route, gas, native price, and manifest evidence", async () => {
    const snapshot = await captureCapabilityCompositionSnapshotV1(policy, dependencies());

    expect(snapshot).toMatchObject({
      version: 1, kind: "capability-composition", requestId: policy.requestId,
      capturedAt: new Date(Number(block.timestamp) * 1_000).toISOString(),
      manifestHash: policy.manifestHash,
      route: { requestId: policy.requestId, blockNumber: block.number.toString() },
      gas: { priceAtomic: "1000000000", nativePriceUsdE8: "10741000000" },
    });
    expect(commitment(snapshot)).toMatch(/^0x[0-9a-f]{64}$/);
  });

  it("fails closed on invalid gas or ambiguous native market evidence", async () => {
    const zeroGas = dependencies();
    zeroGas.getGasPrice.mockResolvedValueOnce(0n);
    await expect(captureCapabilityCompositionSnapshotV1(policy, zeroGas))
      .rejects.toThrow(/gas/i);

    await expect(captureCapabilityCompositionSnapshotV1(policy, dependencies("107.410000001")))
      .rejects.toThrow(/price/i);
    const wrongNative = dependencies();
    wrongNative.getNativeToken.mockResolvedValueOnce({
      chainId: 196, token: "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee",
      symbol: "ETH", decimals: 18, priceUsd: "1",
    });
    await expect(captureCapabilityCompositionSnapshotV1(policy, wrongNative))
      .rejects.toThrow(/OKB/i);
  });
});
