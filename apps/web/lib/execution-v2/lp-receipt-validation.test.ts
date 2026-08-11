import {
  encodeAbiParameters,
  encodeEventTopics,
  zeroAddress,
  type Address,
  type Hex,
} from "viem";
import { describe, expect, it } from "vitest";
import { PROTOCOL_REGISTRY } from "../adapters/registry";
import {
  ERC721_TRANSFER_EVENT_ABI,
  NONFUNGIBLE_POSITION_MANAGER_EVENT_ABI,
} from "./abis";
import { buildPostSwapLiquidityTransactionsV2 } from "./build-post-swap-lp";
import type { ExecutionReceiptV2 } from "./engine-types";
import { validateProtocolEventsV2 } from "./receipt-events";
import { describeExecutionTransactionV2 } from "./transaction-descriptor";
import { lpPlan, NOW_SEC, OWNER, verifiedExecutionInput } from "./test-fixtures";

const manager = PROTOCOL_REGISTRY.uniswapV3.nonfungiblePositionManager.address;
const tokenId = 42n;

function log(address: Address, topics: readonly Hex[], data: Hex) {
  return { address, topics, data };
}

async function mintTransaction() {
  const verified = await verifiedExecutionInput(lpPlan);
  const batch = buildPostSwapLiquidityTransactionsV2({
    ...verified,
    nowSec: NOW_SEC,
    observedOutputBalanceDeltaAtomic: 24_950_000n,
    currentToken0AllowanceAtomic: 24_950_000n,
    currentToken1AllowanceAtomic: 25_000_000n,
  });
  return batch.transactions[0]!;
}

function receipt(amount0 = 24_950_000n, amount1 = 25_000_000n, liquidity = 24_950_000n) {
  return {
    transactionHash: `0x${"11".repeat(32)}`,
    status: "success",
    blockNumber: 100n,
    blockHash: `0x${"22".repeat(32)}`,
    transactionIndex: 0,
    from: OWNER,
    to: manager,
    logs: [
      log(
        manager,
        encodeEventTopics({
          abi: ERC721_TRANSFER_EVENT_ABI,
          eventName: "Transfer",
          args: { from: zeroAddress, to: OWNER, tokenId },
        }) as readonly Hex[],
        "0x",
      ),
      log(
        manager,
        encodeEventTopics({
          abi: NONFUNGIBLE_POSITION_MANAGER_EVENT_ABI,
          eventName: "IncreaseLiquidity",
          args: { tokenId },
        }) as readonly Hex[],
        encodeAbiParameters(
          [{ type: "uint128" }, { type: "uint256" }, { type: "uint256" }],
          [liquidity, amount0, amount1],
        ),
      ),
    ],
  } satisfies ExecutionReceiptV2;
}

describe("Uniswap V3 LP receipt validation", () => {
  it("decodes only the pinned full-range owner mint tuple", async () => {
    expect(describeExecutionTransactionV2(await mintTransaction())).toMatchObject({
      kind: "uniswap-lp-mint",
      token0: lpPlan.legs[0].actions[1].token0,
      token1: lpPlan.legs[0].actions[1].token1,
      amount0DesiredAtomic: 24_950_000n,
      amount1DesiredAtomic: 25_000_000n,
      amount0MinAtomic: 24_700_500n,
      amount1MinAtomic: 24_750_000n,
      minimumLiquidity: 24_700_500n,
    });
  });

  it("attributes the NFT and exact bounded liquidity amounts", async () => {
    expect(validateProtocolEventsV2(await mintTransaction(), receipt())).toEqual({
      kind: "uniswap-lp-mint",
      tokenId,
      liquidity: 24_950_000n,
      amount0Atomic: 24_950_000n,
      amount1Atomic: 25_000_000n,
    });
  });

  it.each([
    ["liquidity floor", receipt(24_950_000n, 25_000_000n, 24_700_499n)],
    ["token0 floor", receipt(24_700_499n, 25_000_000n)],
    ["token1 desired cap", receipt(24_950_000n, 25_000_001n)],
    ["NFT recipient", { ...receipt(), logs: receipt().logs.slice(1) }],
  ])("rejects a receipt outside the signed %s", async (_, invalid) => {
    const transaction = await mintTransaction();
    expect(() => validateProtocolEventsV2(
      transaction, invalid as ExecutionReceiptV2,
    )).toThrow("LP mint");
  });
});
