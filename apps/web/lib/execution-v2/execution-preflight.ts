import type { Address } from "viem";
import { parseExecutionContextV2, type VerifiedExecutionInputV2 } from "./execution-context";
import type { ExecutionReadClientV2 } from "./engine-types";
import type { GuidedPreparedStepV2 } from "./guided-session";
import { readTokenBalanceV2 } from "./transaction-state";
import { describeExecutionTransactionV2 } from "./transaction-descriptor";

export interface GuidedFundingPreflightV2 {
  tokenRequirements: Array<{
    asset: Address;
    requiredAtomic: bigint;
    balanceAtomic: bigint;
  }>;
  gasPriceAtomic: bigint;
  requiredGasAtomic: bigint;
  nativeBalanceAtomic: bigint;
}

function requiredAssets(
  _input: Omit<VerifiedExecutionInputV2, "nowSec">,
  prepared: GuidedPreparedStepV2,
) {
  const descriptor = describeExecutionTransactionV2(prepared.transaction);
  if (descriptor.kind === "allowance") {
    return [{ asset: descriptor.token, amount: descriptor.expectedAtomic }];
  }
  if (descriptor.kind === "swap") {
    return [{ asset: descriptor.tokenIn, amount: descriptor.amountInAtomic }];
  }
  if (descriptor.kind === "aave-supply") {
    return [{ asset: descriptor.asset, amount: descriptor.suppliedAtomic }];
  }
  return [
    { asset: descriptor.token0, amount: descriptor.amount0DesiredAtomic },
    { asset: descriptor.token1, amount: descriptor.amount1DesiredAtomic },
  ];
}

export async function assertGuidedFundsV2(
  readClient: ExecutionReadClientV2,
  input: Omit<VerifiedExecutionInputV2, "nowSec">,
  prepared: GuidedPreparedStepV2,
): Promise<GuidedFundingPreflightV2> {
  const context = parseExecutionContextV2({ ...input, nowSec: 0 });
  const requirements = requiredAssets(input, prepared);
  const [balances, nativeBalanceAtomic, gasPriceAtomic] = await Promise.all([
    Promise.all(requirements.map(({ asset }) => readTokenBalanceV2(
      readClient, asset, context.owner, prepared.preBlockNumber,
    ))),
    readClient.getBalance(context.owner),
    readClient.getGasPrice(),
  ]);
  const tokenRequirements = requirements.map(({ asset, amount }, index) => ({
    asset,
    requiredAtomic: amount,
    balanceAtomic: balances[index]!,
  }));
  if (tokenRequirements.some(({ balanceAtomic, requiredAtomic }) =>
    balanceAtomic < requiredAtomic)) {
    throw new Error("Wallet token balance is below the exact route requirement");
  }
  if (gasPriceAtomic <= 0n) throw new Error("X Layer gas price is unavailable");
  const requiredGasAtomic = (prepared.gasEstimate * gasPriceAtomic * 12n + 9n) / 10n;
  if (nativeBalanceAtomic < requiredGasAtomic) {
    throw new Error("Wallet OKB balance is below the buffered gas requirement");
  }
  return {
    tokenRequirements,
    gasPriceAtomic,
    requiredGasAtomic,
    nativeBalanceAtomic,
  };
}
