import {
  decodeFunctionData,
  encodeAbiParameters,
  encodeEventTopics,
  isAddressEqual,
  type Hash,
  type Hex,
} from "viem";
import { describe, expect, it } from "vitest";
import { PROTOCOL_REGISTRY } from "../adapters/registry";
import {
  CURVE_STABLESWAP_NG_EXCHANGE_ABI,
  CURVE_TOKEN_EXCHANGE_EVENT_ABI,
  ERC20_APPROVE_ABI,
} from "./abis";
import { buildInitialRouteTransactionsV2 } from "./build-initial";
import {
  INPUT_ATOMIC,
  MINIMUM_OUTPUT_ATOMIC,
  NOW_SEC,
  OWNER,
  OUTPUT_ATOMIC,
  curvePlan,
  usdg,
  usdt0,
  verifiedExecutionInput,
} from "./test-fixtures";
import { describeExecutionTransactionV2 } from "./transaction-descriptor";
import { validateProtocolEventsV2 } from "./receipt-events";

async function curveExchange() {
  const verified = await verifiedExecutionInput(curvePlan);
  return buildInitialRouteTransactionsV2({
    ...verified,
    nowSec: NOW_SEC,
    currentAllowanceAtomic: INPUT_ATOMIC,
  }).transactions[0]!;
}

describe("Curve StableSwap NG execution encoding", () => {
  it("approves only the exact input and encodes the bounded owner-receiver exchange", async () => {
    const verified = await verifiedExecutionInput(curvePlan);
    const batch = buildInitialRouteTransactionsV2({
      ...verified,
      nowSec: NOW_SEC,
      currentAllowanceAtomic: 1n,
    });
    const [reset, approval, exchange] = batch.transactions;
    const pool = PROTOCOL_REGISTRY.curveStableSwapNg.pair.pool.address;

    expect(batch.transactions.map(({ label }) => label)).toEqual([
      "reset-curve-allowance",
      "approve-curve-exact",
      "curve-stableswap-ng-exact-input",
    ]);
    for (const transaction of [reset, approval]) {
      expect(isAddressEqual(transaction.to, usdt0)).toBe(true);
    }
    expect(decodeFunctionData({ abi: ERC20_APPROVE_ABI, data: reset.data }).args)
      .toEqual([pool, 0n]);
    expect(decodeFunctionData({ abi: ERC20_APPROVE_ABI, data: approval.data }).args)
      .toEqual([pool, INPUT_ATOMIC]);
    expect(isAddressEqual(exchange.to, pool)).toBe(true);
    expect(decodeFunctionData({
      abi: CURVE_STABLESWAP_NG_EXCHANGE_ABI,
      data: exchange.data,
    })).toMatchObject({
      functionName: "exchange",
      args: [1n, 0n, INPUT_ATOMIC, MINIMUM_OUTPUT_ATOMIC, OWNER],
    });
    expect(describeExecutionTransactionV2(exchange)).toMatchObject({
      kind: "swap",
      venue: "curve-stableswap-ng",
      pool,
      tokenIn: usdt0,
      tokenOut: usdg,
      amountInAtomic: INPUT_ATOMIC,
      minimumOutputAtomic: MINIMUM_OUTPUT_ATOMIC,
    });
    expect(batch.postconditions).toEqual([{
      kind: "owner-output-balance-delta",
      owner: OWNER,
      asset: usdg,
      minimumDeltaAtomic: MINIMUM_OUTPUT_ATOMIC,
      quotedDeltaAtomic: OUTPUT_ATOMIC,
    }]);
  });

  it("rejects a Curve action whose signed pool is not the registered deployment", async () => {
    const leg = curvePlan.legs[0];
    const routePlan = {
      ...curvePlan,
      legs: [{
        ...leg,
        actions: [{
          ...leg.actions[0],
          pool: "0x2222222222222222222222222222222222222222",
        }, leg.actions[1]],
      }],
    };
    await expect(verifiedExecutionInput(routePlan)).rejects.toThrow();
  });

  it("attributes the exact Curve TokenExchange event to the owner and signed indices", async () => {
    const exchange = await curveExchange();
    const hash = `0x${"12".repeat(32)}` as Hash;
    const evidence = validateProtocolEventsV2(exchange, {
      transactionHash: hash,
      status: "success",
      blockNumber: 100n,
      blockHash: `0x${"34".repeat(32)}`,
      transactionIndex: 0,
      from: OWNER,
      to: PROTOCOL_REGISTRY.curveStableSwapNg.pair.pool.address,
      logs: [{
        address: PROTOCOL_REGISTRY.curveStableSwapNg.pair.pool.address,
        topics: encodeEventTopics({
          abi: CURVE_TOKEN_EXCHANGE_EVENT_ABI,
          eventName: "TokenExchange",
          args: { buyer: OWNER },
        }) as readonly Hex[],
        data: encodeAbiParameters([
          { type: "int128" },
          { type: "uint256" },
          { type: "int128" },
          { type: "uint256" },
        ], [1n, INPUT_ATOMIC, 0n, OUTPUT_ATOMIC]),
      }],
    });

    expect(evidence).toEqual({
      kind: "swap",
      venue: "curve-stableswap-ng",
      sender: OWNER,
      recipient: OWNER,
      inputAtomic: INPUT_ATOMIC,
      outputAtomic: OUTPUT_ATOMIC,
    });
  });
});
