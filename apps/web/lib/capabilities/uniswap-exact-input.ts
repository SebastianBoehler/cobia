import type { CapabilityModuleV1 } from "@cobia/solvers";
import { encodeFunctionData } from "viem";
import { z } from "zod";
import { PROTOCOL_REGISTRY } from "../adapters/registry";
import { SWAP_ROUTER02_ABI } from "../execution-v2/abis";
import {
  AddressSchema,
  PositiveAtomicSchema,
  assertProductionManifest,
  pinned,
  registeredPair,
  selectorOf,
} from "./shared";

const ParametersSchema = z.object({
  tokenIn: AddressSchema,
  tokenOut: AddressSchema,
  amountInAtomic: PositiveAtomicSchema,
  minimumOutputAtomic: PositiveAtomicSchema,
}).strict();
type Parameters = z.infer<typeof ParametersSchema>;

export const uniswapExactInputCapabilityV1: CapabilityModuleV1<Parameters> = {
  id: "uniswap-v3.exact-input",
  version: 1,
  policyAdapterId: "uniswap-v3@1",
  parseParameters: (input) => ParametersSchema.parse(input),
  compile({ program, parameters, manifest }) {
    assertProductionManifest(manifest, program.manifestHash);
    const pair = registeredPair(parameters.tokenIn, parameters.tokenOut);
    const data = encodeFunctionData({
      abi: SWAP_ROUTER02_ABI,
      functionName: "exactInputSingle",
      args: [{
        tokenIn: pair.input.underlying.address,
        tokenOut: pair.output.underlying.address,
        fee: PROTOCOL_REGISTRY.uniswapV3.pair.fee,
        recipient: program.executor,
        amountIn: BigInt(parameters.amountInAtomic),
        amountOutMinimum: BigInt(parameters.minimumOutputAtomic),
        sqrtPriceLimitX96: 0n,
      }],
    });
    return {
      capabilityId: "uniswap-v3.exact-input",
      capabilityVersion: 1,
      target: PROTOCOL_REGISTRY.uniswapV3.swapRouter02.address,
      selector: selectorOf(data),
      data,
      expectedGas: 700_000,
      spend: [{ token: pair.input.underlying.address, atomic: parameters.amountInAtomic }],
      guaranteedOutputs: [{
        token: pair.output.underlying.address,
        account: program.executor,
        minimumIncreaseAtomic: parameters.minimumOutputAtomic,
      }],
      deployments: pinned(
        PROTOCOL_REGISTRY.uniswapV3.swapRouter02,
        PROTOCOL_REGISTRY.uniswapV3.pair.pool,
        pair.input.underlying,
        pair.output.underlying,
      ),
      evidencePredicates: [{
        kind: "uniswap-v3.exact-input",
        tokenIn: pair.input.underlying.address,
        tokenOut: pair.output.underlying.address,
        recipient: program.executor,
        minimumOutputAtomic: parameters.minimumOutputAtomic,
      }],
    };
  },
  verifyEvidence: () => [],
};
