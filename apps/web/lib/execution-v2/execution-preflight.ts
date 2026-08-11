import type { Address } from "viem";
import { parseExecutionContextV2, type VerifiedExecutionInputV2 } from "./execution-context";
import type { ExecutionReadClientV2 } from "./engine-types";
import type { GuidedPreparedStepV2 } from "./guided-session";
import { readTokenBalanceV2 } from "./transaction-state";

export interface GuidedFundingPreflightV2 {
  asset: Address;
  requiredTokenAtomic: bigint;
  tokenBalanceAtomic: bigint;
  gasPriceAtomic: bigint;
  requiredGasAtomic: bigint;
  nativeBalanceAtomic: bigint;
}

function requiredAsset(
  input: Omit<VerifiedExecutionInputV2, "nowSec">,
  prepared: GuidedPreparedStepV2,
) {
  const plan = parseExecutionContextV2({ ...input, nowSec: 0 }).routePlan;
  const first = plan.legs[0]?.actions[0];
  if (!first) throw new Error("Execution route has no principal action");
  if (prepared.phase === "initial") {
    return {
      asset: first.kind === "aave-v3-supply" ? first.asset : first.tokenIn,
      amount: BigInt(plan.legs[0]!.inputAtomic),
    };
  }
  if (first.kind !== "uniswap-v3-exact-input") {
    throw new Error("Post-swap funding preflight requires a swap route");
  }
  return { asset: first.tokenOut, amount: prepared.authorizedAmountAtomic };
}

export async function assertGuidedFundsV2(
  readClient: ExecutionReadClientV2,
  input: Omit<VerifiedExecutionInputV2, "nowSec">,
  prepared: GuidedPreparedStepV2,
): Promise<GuidedFundingPreflightV2> {
  const context = parseExecutionContextV2({ ...input, nowSec: 0 });
  const requirement = requiredAsset(input, prepared);
  const [tokenBalanceAtomic, nativeBalanceAtomic, gasPriceAtomic] = await Promise.all([
    readTokenBalanceV2(
      readClient,
      requirement.asset,
      context.owner,
      prepared.preBlockNumber,
    ),
    readClient.getBalance(context.owner),
    readClient.getGasPrice(),
  ]);
  if (tokenBalanceAtomic < requirement.amount) {
    throw new Error("Wallet token balance is below the exact route requirement");
  }
  if (gasPriceAtomic <= 0n) throw new Error("X Layer gas price is unavailable");
  const requiredGasAtomic = (prepared.gasEstimate * gasPriceAtomic * 12n + 9n) / 10n;
  if (nativeBalanceAtomic < requiredGasAtomic) {
    throw new Error("Wallet OKB balance is below the buffered gas requirement");
  }
  return {
    asset: requirement.asset,
    requiredTokenAtomic: requirement.amount,
    tokenBalanceAtomic,
    gasPriceAtomic,
    requiredGasAtomic,
    nativeBalanceAtomic,
  };
}
