import type { Address } from "viem";
import { describe, expect, it } from "vitest";
import { buildInitialRouteTransactionsV2 } from "./build-initial";
import {
  executionPolicy,
  executionSnapshot,
  INPUT_ATOMIC,
  MINIMUM_OUTPUT_ATOMIC,
  NOW_SEC,
  swapPlan,
  usdg,
  verifiedExecutionInput,
} from "./test-fixtures";

describe("buildInitialRouteTransactionsV2 atomic objectives", () => {
  it("builds a terminal Swap without inventing a protocol continuation", async () => {
    const routePlan = {
      ...swapPlan,
      inputAtomic: INPUT_ATOMIC.toString(),
      retainedAtomic: "0",
      legs: [{ ...swapPlan.legs[0], actions: [swapPlan.legs[0].actions[0]] }],
    } as const;
    const policy = {
      ...executionPolicy,
      principalAtomic: INPUT_ATOMIC.toString(),
      protocolExposureBps: 10_000,
      objective: {
        kind: "swap" as const,
        outputAsset: usdg.toLowerCase() as Address,
        minimumOutputAtomic: MINIMUM_OUTPUT_ATOMIC.toString(),
      },
    };
    const verified = await verifiedExecutionInput(routePlan, policy, executionSnapshot);

    const result = buildInitialRouteTransactionsV2({
      ...verified,
      nowSec: NOW_SEC,
      currentAllowanceAtomic: INPUT_ATOMIC,
    });

    expect(result.transactions.map(({ label }) => label)).toEqual(["uniswap-v3-exact-input"]);
    expect(result.postconditions[0]).toMatchObject({
      kind: "owner-output-balance-delta",
      minimumDeltaAtomic: MINIMUM_OUTPUT_ATOMIC,
    });
  });
});
