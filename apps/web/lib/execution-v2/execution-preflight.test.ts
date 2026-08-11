import { describe, expect, it } from "vitest";
import { PROTOCOL_REGISTRY } from "../adapters/registry";
import {
  pool,
  ScriptedReadClient,
  testBlockHash,
  transactionHash,
} from "./engine.test-fixture";
import { assertGuidedFundsV2 } from "./execution-preflight";
import { prepareNextGuidedStepV2 } from "./guided-session";
import {
  INPUT_ATOMIC,
  NOW_SEC,
  directPlan,
  lpPlan,
  usdg,
  usdt0,
  verifiedExecutionInput,
} from "./test-fixtures";
import type { ConfirmedOwnerTransactionV2 } from "./engine-types";

async function context(balance: bigint, nativeBalance = 10n ** 18n) {
  const read = new ScriptedReadClient([]);
  read.nativeBalance = nativeBalance;
  read.latestBlocks.push(90n);
  read.allowance(usdt0, pool, 90n, 0n);
  read.balance(usdt0, 90n, balance);
  const verified = await verifiedExecutionInput(directPlan);
  const prepared = await prepareNextGuidedStepV2({
    ...verified, nowSec: NOW_SEC, readClient: read,
  }, []);
  if (prepared.kind !== "prepared") throw new Error("Expected prepared step");
  return { read, verified, prepared };
}

describe("guided mainnet funding preflight", () => {
  it("requires the exact principal token before an approval prompt", async () => {
    const { read, verified, prepared } = await context(INPUT_ATOMIC - 1n);
    await expect(assertGuidedFundsV2(read, verified, prepared))
      .rejects.toThrow("token balance");
  });

  it("requires a buffered OKB gas balance for the next exact transaction", async () => {
    const { read, verified, prepared } = await context(INPUT_ATOMIC, 1n);
    await expect(assertGuidedFundsV2(read, verified, prepared))
      .rejects.toThrow("OKB");
  });

  it("reports exact token and buffered gas requirements when funded", async () => {
    const { read, verified, prepared } = await context(INPUT_ATOMIC);
    await expect(assertGuidedFundsV2(read, verified, prepared)).resolves.toEqual({
      tokenRequirements: [{
        asset: usdt0,
        requiredAtomic: INPUT_ATOMIC,
        balanceAtomic: INPUT_ATOMIC,
      }],
      gasPriceAtomic: read.gasPrice,
      requiredGasAtomic: prepared.gasEstimate * read.gasPrice * 12n / 10n,
      nativeBalanceAtomic: read.nativeBalance,
    });
  });

  it("requires both exact pool-token balances before the LP mint prompt", async () => {
    const read = new ScriptedReadClient([]);
    const manager = PROTOCOL_REGISTRY.uniswapV3.nonfungiblePositionManager.address;
    const verified = await verifiedExecutionInput(lpPlan);
    const confirmedSwap = {
      label: "uniswap-v3-exact-input",
      hash: transactionHash(71),
      preBlockNumber: 248n,
      preBlockHash: testBlockHash(248n),
      blockNumber: 249n,
      blockHash: testBlockHash(249n),
      transactionIndex: 0,
      status: "success",
      gasEstimate: 21_000n,
      protocolEvidence: {
        kind: "swap", sender: verified.policy.owner, recipient: verified.policy.owner,
        inputAtomic: 25_000_000n, outputAtomic: 24_950_000n,
      },
      stateCheck: {
        kind: "swap", tokenIn: usdt0, tokenOut: usdg,
        inputSpentAtomic: 25_000_000n, outputDeltaAtomic: 24_950_000n,
        ownerOutputBalanceDeltaAtomic: 24_950_000n,
        minimumOutputAtomic: 24_700_500n,
      },
    } satisfies ConfirmedOwnerTransactionV2;
    read.latestBlocks.push(250n);
    read.allowance(usdg, manager, 250n, 24_950_000n);
    read.allowance(usdt0, manager, 250n, 25_000_000n);
    read.balance(usdg, 250n, 24_950_000n);
    read.balance(usdt0, 250n, 24_999_999n);
    const prepared = await prepareNextGuidedStepV2({
      ...verified, nowSec: NOW_SEC, readClient: read,
    }, [confirmedSwap]);
    if (prepared.kind !== "prepared") throw new Error("Expected LP mint step");

    await expect(assertGuidedFundsV2(read, verified, prepared))
      .rejects.toThrow("token balance");
  });
});
