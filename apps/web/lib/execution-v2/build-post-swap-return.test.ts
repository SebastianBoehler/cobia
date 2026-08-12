import { decodeFunctionData } from "viem";
import { describe, expect, it } from "vitest";
import { PROTOCOL_REGISTRY } from "../adapters/registry";
import { ERC20_APPROVE_ABI, SWAP_ROUTER02_ABI } from "./abis";
import { buildPostSwapReturnTransactionsV2 } from "./build-post-swap-return";
import {
  DEADLINE_SEC,
  NOW_SEC,
  OUTPUT_ATOMIC,
  usdg,
  usdt0,
  verifiedExecutionInput,
} from "./test-fixtures";
import {
  FINAL_MINIMUM_ATOMIC,
  profitExecutionFixture,
  RETURN_INPUT_ATOMIC,
} from "./profit-test-fixture";

describe("buildPostSwapReturnTransactionsV2", () => {
  it("spends only the signed conservative first output on the return swap", async () => {
    const fixture = profitExecutionFixture();
    const verified = await verifiedExecutionInput(
      fixture.routePlan, fixture.policy, fixture.snapshot,
    );

    const batch = buildPostSwapReturnTransactionsV2({
      ...verified,
      nowSec: NOW_SEC,
      observedOutputBalanceDeltaAtomic: OUTPUT_ATOMIC,
      currentAllowanceAtomic: 0n,
    });

    expect(batch.transactions.map(({ label }) => label)).toEqual([
      "approve-uniswap-exact", "uniswap-v3-exact-input",
    ]);
    const approval = decodeFunctionData({
      abi: ERC20_APPROVE_ABI,
      data: batch.transactions[0]!.data,
    });
    expect(approval.args).toEqual([
      PROTOCOL_REGISTRY.uniswapV3.swapRouter02.address,
      RETURN_INPUT_ATOMIC,
    ]);
    const outer = decodeFunctionData({
      abi: SWAP_ROUTER02_ABI,
      data: batch.transactions[1]!.data,
    });
    if (outer.functionName !== "multicall") throw new Error("Expected multicall");
    expect(outer.args[0]).toBe(BigInt(DEADLINE_SEC));
    const inner = decodeFunctionData({ abi: SWAP_ROUTER02_ABI, data: outer.args[1][0]! });
    expect(inner.args[0]).toMatchObject({
      tokenIn: usdg,
      tokenOut: usdt0,
      amountIn: RETURN_INPUT_ATOMIC,
      amountOutMinimum: FINAL_MINIMUM_ATOMIC,
    });
  });

  it("rejects a first fill below the signed second input", async () => {
    const fixture = profitExecutionFixture();
    const verified = await verifiedExecutionInput(
      fixture.routePlan, fixture.policy, fixture.snapshot,
    );
    expect(() => buildPostSwapReturnTransactionsV2({
      ...verified,
      nowSec: NOW_SEC,
      observedOutputBalanceDeltaAtomic: RETURN_INPUT_ATOMIC - 1n,
      currentAllowanceAtomic: 0n,
    })).toThrow("below the signed return input");
  });
});
