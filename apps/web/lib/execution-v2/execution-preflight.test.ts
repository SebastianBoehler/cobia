import { describe, expect, it } from "vitest";
import { pool, ScriptedReadClient } from "./engine.test-fixture";
import { assertGuidedFundsV2 } from "./execution-preflight";
import { prepareNextGuidedStepV2 } from "./guided-session";
import {
  INPUT_ATOMIC,
  NOW_SEC,
  directPlan,
  usdt0,
  verifiedExecutionInput,
} from "./test-fixtures";

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
      asset: usdt0.toLowerCase(),
      requiredTokenAtomic: INPUT_ATOMIC,
      tokenBalanceAtomic: INPUT_ATOMIC,
      gasPriceAtomic: read.gasPrice,
      requiredGasAtomic: prepared.gasEstimate * read.gasPrice * 12n / 10n,
      nativeBalanceAtomic: read.nativeBalance,
    });
  });
});
