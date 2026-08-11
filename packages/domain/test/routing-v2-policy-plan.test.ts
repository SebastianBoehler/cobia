import { describe, expect, it } from "vitest";
import {
  RoutePlanV2Schema,
  StablecoinPolicyV2Schema,
} from "../src/index";
import {
  outputAssetV2,
  policyV2,
  routePlanV2,
} from "./routing-v2-fixtures";

const checksummedUsdt0 = "0x779Ded0c9e1022225f8E0630b35a9b54bE713736";
const canonicalUsdt0 = checksummedUsdt0.toLowerCase();
const checksummedUsdg = "0x4ae46a509F6b1D9056937BA4500cb143933D2dc8";
const canonicalUsdg = checksummedUsdg.toLowerCase();

describe("V2 policy and route boundaries", () => {
  it("names the signed optimistic threshold as pre-gas APY", () => {
    const preGasPolicy = {
      ...policyV2,
      minPreGasApyBps: 20,
    } as Record<string, unknown>;
    delete preGasPolicy.minNetApyBps;

    expect(StablecoinPolicyV2Schema.safeParse(preGasPolicy).success).toBe(true);
    expect(StablecoinPolicyV2Schema.safeParse({
      ...preGasPolicy,
      minNetApyBps: 20,
    }).success).toBe(false);
  });

  it("uses an exact protocol exposure field", () => {
    const exactPolicy = {
      ...policyV2,
      protocolExposureBps: 6_000,
    } as Record<string, unknown>;
    delete exactPolicy.maxProtocolExposureBps;

    expect(StablecoinPolicyV2Schema.safeParse(exactPolicy).success).toBe(true);
    expect(StablecoinPolicyV2Schema.safeParse({
      ...exactPolicy,
      maxProtocolExposureBps: 6_000,
    }).success).toBe(false);
  });

  it("accepts a signed bounded routing policy", () => {
    expect(StablecoinPolicyV2Schema.parse(policyV2)).toEqual(policyV2);
    expect(
      StablecoinPolicyV2Schema.safeParse({ ...policyV2, maxSlippageBps: 501 }).success,
    ).toBe(false);
    expect(
      StablecoinPolicyV2Schema.safeParse({ ...policyV2, horizonDays: 366 }).success,
    ).toBe(false);
  });

  it("rejects duplicate output authorization and unknown fields", () => {
    expect(
      StablecoinPolicyV2Schema.safeParse({
        ...policyV2,
        allowedOutputAssets: [policyV2.asset, policyV2.asset],
      }).success,
    ).toBe(false);
    expect(
      StablecoinPolicyV2Schema.safeParse({
        ...policyV2,
        allowedOutputAssets: [...policyV2.allowedOutputAssets].reverse(),
      }).success,
    ).toBe(false);
    expect(
      StablecoinPolicyV2Schema.safeParse({
        ...policyV2,
        allowedOutputAssets: [outputAssetV2],
      }).success,
    ).toBe(false);
    expect(
      StablecoinPolicyV2Schema.safeParse({
        ...policyV2,
        allowedAdapters: ["xlayer:fake:v1"],
      }).success,
    ).toBe(false);
    expect(
      StablecoinPolicyV2Schema.safeParse({ ...policyV2, permit2: true }).success,
    ).toBe(false);
  });

  it("canonicalizes every signed policy address before commitment", () => {
    const result = StablecoinPolicyV2Schema.safeParse({
      ...policyV2,
      owner: checksummedUsdt0,
      asset: checksummedUsdt0,
      allowedOutputAssets: [checksummedUsdt0],
    });
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.owner).toBe(canonicalUsdt0);
    expect(result.data.asset).toBe(canonicalUsdt0);
    expect(result.data.allowedOutputAssets).toEqual([canonicalUsdt0]);
  });

  it("enforces exact principal conservation with positive bounded legs", () => {
    expect(RoutePlanV2Schema.parse(routePlanV2)).toEqual(routePlanV2);
    expect(
      RoutePlanV2Schema.safeParse({ ...routePlanV2, retainedAtomic: "9999999" }).success,
    ).toBe(false);
    expect(
      RoutePlanV2Schema.safeParse({
        ...routePlanV2,
        legs: [{ ...routePlanV2.legs[0], inputAtomic: "0" }],
      }).success,
    ).toBe(false);
  });

  it("represents the no-action baseline only by retaining the full input", () => {
    expect(
      RoutePlanV2Schema.safeParse({
        ...routePlanV2,
        retainedAtomic: routePlanV2.inputAtomic,
        legs: [],
      }).success,
    ).toBe(true);
    expect(
      RoutePlanV2Schema.safeParse({
        ...routePlanV2,
        retainedAtomic: "24999999",
        legs: [],
      }).success,
    ).toBe(false);
  });

  it("only permits direct supply or exact-input swap followed by supply", () => {
    const swapped = routePlanV2.legs[0];
    expect(
      RoutePlanV2Schema.safeParse({
        ...routePlanV2,
        legs: [{
          ...swapped,
          actions: [swapped.actions[1], swapped.actions[0]],
        }],
      }).success,
    ).toBe(false);
    expect(
      RoutePlanV2Schema.safeParse({
        ...routePlanV2,
        legs: [{
          ...swapped,
          actions: [
            swapped.actions[0],
            { ...swapped.actions[1], asset: policyV2.asset },
          ],
        }],
      }).success,
    ).toBe(false);
  });

  it("rejects solver-selected execution surfaces", () => {
    const leg = routePlanV2.legs[0];
    for (const extra of [
      { target: policyV2.owner },
      { recipient: policyV2.owner },
      { calldata: "0x1234" },
    ]) {
      expect(
        RoutePlanV2Schema.safeParse({
          ...routePlanV2,
          legs: [{
            ...leg,
            actions: [{ ...leg.actions[0], ...extra }, leg.actions[1]],
          }],
        }).success,
      ).toBe(false);
    }
  });

  it("canonicalizes every route-plan address", () => {
    const leg = routePlanV2.legs[0];
    const parsed = RoutePlanV2Schema.parse({
      ...routePlanV2,
      inputAsset: checksummedUsdt0,
      legs: [{
        ...leg,
        actions: [
          {
            ...leg.actions[0],
            tokenIn: checksummedUsdt0,
            tokenOut: checksummedUsdg,
          },
          { ...leg.actions[1], asset: checksummedUsdg },
        ],
      }],
    });
    expect(parsed.inputAsset).toBe(canonicalUsdt0);
    expect(parsed.legs[0].actions[0]).toMatchObject({
      tokenIn: canonicalUsdt0,
      tokenOut: canonicalUsdg,
    });
    expect(parsed.legs[0].actions[1]).toMatchObject({ asset: canonicalUsdg });
  });

  it("rejects reuse of an amount-specific swap quote across legs", () => {
    const swapped = routePlanV2.legs[0];
    expect(
      RoutePlanV2Schema.safeParse({
        ...routePlanV2,
        retainedAtomic: "5000000",
        legs: [swapped, { ...swapped, id: "duplicate-swap" }],
      }).success,
    ).toBe(false);
  });

  it("rejects split deployment across multiple independently quoted legs", () => {
    const swapped = routePlanV2.legs.find(
      (leg) => leg.actions[0].kind === "uniswap-v3-exact-input",
    );
    expect(swapped).toBeDefined();
    expect(
      RoutePlanV2Schema.safeParse({
        ...routePlanV2,
        retainedAtomic: "10000000",
        legs: [
          {
            id: "direct-usdt0",
            inputAtomic: "5000000",
            actions: [{
              kind: "aave-v3-supply",
              opportunityId: "aave-v3:usdt0",
              consume: "all",
              asset: policyV2.asset,
            }],
          },
          swapped,
        ],
      }).success,
    ).toBe(false);
  });
});
