import { RouteSnapshotV2Schema } from "@cobia/domain";
import type { Address } from "viem";
import {
  executionPolicy,
  executionSnapshot,
  INPUT_ATOMIC,
  swapPlan,
  usdg,
  usdt0,
} from "./test-fixtures";

export const RETURN_INPUT_ATOMIC = 49_000_000n;
export const FINAL_QUOTE_ATOMIC = 50_500_000n;
export const FINAL_MINIMUM_ATOMIC = 50_100_000n;

export function profitExecutionFixture() {
  const reverseId = "uniswap-v3:registered-pair:reverse";
  const routePlan = {
    ...swapPlan,
    inputAtomic: INPUT_ATOMIC.toString(),
    retainedAtomic: "0",
    legs: [{ ...swapPlan.legs[0], actions: [
      swapPlan.legs[0].actions[0],
      {
        kind: "uniswap-v3-exact-input" as const,
        opportunityId: reverseId,
        consume: "exact" as const,
        inputAtomic: RETURN_INPUT_ATOMIC.toString(),
        tokenIn: usdg,
        tokenOut: usdt0,
        quotedOutputAtomic: FINAL_QUOTE_ATOMIC.toString(),
        minimumOutputAtomic: FINAL_MINIMUM_ATOMIC.toString(),
      },
    ] }],
  } as const;
  const policy = {
    ...executionPolicy,
    principalAtomic: INPUT_ATOMIC.toString(),
    protocolExposureBps: 10_000,
    objective: {
      kind: "profit" as const,
      minimumFinalAtomic: FINAL_MINIMUM_ATOMIC.toString(),
    },
  };
  const snapshot = RouteSnapshotV2Schema.parse({
    ...executionSnapshot,
    opportunities: [...executionSnapshot.opportunities, {
      id: reverseId,
      kind: "uniswap-v3-exact-input",
      adapterId: "uniswap-v3@1",
      tokenIn: usdg.toLowerCase() as Address,
      tokenOut: usdt0.toLowerCase() as Address,
      feeTier: 100,
      quotedInputAtomic: RETURN_INPUT_ATOMIC.toString(),
      quotedOutputAtomic: FINAL_QUOTE_ATOMIC.toString(),
      estimatedGas: "100000",
    }],
  });
  return { routePlan, policy, snapshot };
}
