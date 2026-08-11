import type { RouteOpportunityV2, StablecoinPolicyV2 } from "@cobia/domain";
import { isAddressEqual, type Address } from "viem";
import type { CurveStableSwapNgQuote } from "../adapters/curve-reader";
import { ProtocolIneligibleError } from "../adapters/protocol-error";
import {
  PROTOCOL_REGISTRY,
  type RegistryAsset,
} from "../adapters/registry";
import type { BlockReference } from "../adapters/read-client";
import type { UniswapExactInputQuote } from "../adapters/uniswap-reader";

interface RegisteredSwapAsset {
  key: RegistryAsset;
  address: Address;
}

export interface ExactSwapCaptureDependencies {
  quoteExactInput(input: {
    tokenIn: RegistryAsset;
    tokenOut: RegistryAsset;
    amountInAtomic: bigint;
    block: BlockReference;
  }): Promise<UniswapExactInputQuote>;
  quoteCurveExactInput(input: {
    tokenIn: RegistryAsset;
    tokenOut: RegistryAsset;
    amountInAtomic: bigint;
    block: BlockReference;
  }): Promise<CurveStableSwapNgQuote>;
}

export interface CapturedExactSwaps {
  opportunities: RouteOpportunityV2[];
  outputAmounts: Array<{ asset: RegistryAsset; amountAtomic: bigint }>;
}

type AssertContext = (
  value: { registryHash: string; blockNumber: bigint; blockHash: string; blockTimestamp: bigint },
  block: BlockReference,
) => void;

export async function captureExactSwapOpportunities(input: {
  policy: StablecoinPolicyV2;
  deployedAtomic: bigint;
  inputAsset: RegisteredSwapAsset;
  outputAsset?: RegisteredSwapAsset;
  block: BlockReference;
  dependencies: ExactSwapCaptureDependencies;
  assertContext: AssertContext;
}): Promise<CapturedExactSwaps> {
  const opportunities: RouteOpportunityV2[] = [];
  const outputAmounts: CapturedExactSwaps["outputAmounts"] = [];
  if (input.deployedAtomic <= 0n || !input.outputAsset) {
    return { opportunities, outputAmounts };
  }
  const request = {
    tokenIn: input.inputAsset.key,
    tokenOut: input.outputAsset.key,
    amountInAtomic: input.deployedAtomic,
    block: input.block,
  };

  if (input.policy.allowedAdapters.includes("uniswap-v3@1")) {
    try {
      const quote = await input.dependencies.quoteExactInput(request);
      input.assertContext(quote, input.block);
      if (!isAddressEqual(quote.tokenIn, input.inputAsset.address) ||
        !isAddressEqual(quote.tokenOut, input.outputAsset.address) ||
        quote.amountInAtomic !== input.deployedAtomic ||
        !isAddressEqual(quote.pool, PROTOCOL_REGISTRY.uniswapV3.pair.pool.address) ||
        quote.fee !== PROTOCOL_REGISTRY.uniswapV3.pair.fee) {
        throw new Error("Uniswap quote does not match the requested route");
      }
      opportunities.push({
        id: `uniswap-v3:${quote.tokenIn.toLowerCase()}:${quote.tokenOut.toLowerCase()}:${quote.fee}:${quote.amountInAtomic}`,
        kind: "uniswap-v3-exact-input",
        adapterId: quote.adapterId,
        tokenIn: quote.tokenIn,
        tokenOut: quote.tokenOut,
        feeTier: quote.fee,
        quotedInputAtomic: quote.amountInAtomic.toString(),
        quotedOutputAtomic: quote.amountOutAtomic.toString(),
        estimatedGas: quote.gasEstimate.toString(),
      });
      outputAmounts.push({ asset: input.outputAsset.key, amountAtomic: quote.amountOutAtomic });
    } catch (error) {
      if (!(error instanceof ProtocolIneligibleError)) throw error;
    }
  }

  if (input.policy.allowedAdapters.includes("curve-stableswap-ng@1")) {
    try {
      const quote = await input.dependencies.quoteCurveExactInput(request);
      input.assertContext(quote, input.block);
      const deployment = PROTOCOL_REGISTRY.curveStableSwapNg;
      if (!isAddressEqual(quote.tokenIn, input.inputAsset.address) ||
        !isAddressEqual(quote.tokenOut, input.outputAsset.address) ||
        quote.amountInAtomic !== input.deployedAtomic ||
        !isAddressEqual(quote.pool, deployment.pair.pool.address) ||
        quote.fee !== BigInt(deployment.pair.fee)) {
        throw new Error("Curve quote does not match the requested route");
      }
      opportunities.push({
        id: `curve-stableswap-ng:${quote.tokenIn.toLowerCase()}:${quote.tokenOut.toLowerCase()}:${quote.amountInAtomic}`,
        kind: "curve-stableswap-ng-exact-input",
        adapterId: quote.adapterId,
        pool: quote.pool,
        tokenIn: quote.tokenIn,
        tokenOut: quote.tokenOut,
        inputIndex: quote.inputIndex,
        outputIndex: quote.outputIndex,
        fee: quote.fee.toString(),
        quotedInputAtomic: quote.amountInAtomic.toString(),
        quotedOutputAtomic: quote.amountOutAtomic.toString(),
      });
      outputAmounts.push({ asset: input.outputAsset.key, amountAtomic: quote.amountOutAtomic });
    } catch (error) {
      if (!(error instanceof ProtocolIneligibleError)) throw error;
    }
  }
  return { opportunities, outputAmounts };
}
