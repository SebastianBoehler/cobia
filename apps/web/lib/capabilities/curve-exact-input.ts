import type { CapabilityModuleV1 } from "@cobia/solvers";
import { encodeFunctionData, isAddressEqual } from "viem";
import { z } from "zod";
import { PROTOCOL_REGISTRY } from "../adapters/registry";
import { CURVE_STABLESWAP_NG_EXCHANGE_ABI } from "../execution-v2/abis";
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

export const curveExactInputCapabilityV1: CapabilityModuleV1<Parameters> = {
  id: "curve-stableswap-ng.exact-input",
  version: 1,
  parseParameters: (input) => ParametersSchema.parse(input),
  compile({ program, parameters, manifest }) {
    assertProductionManifest(manifest, program.manifestHash);
    const pair = registeredPair(parameters.tokenIn, parameters.tokenOut);
    const token0 = PROTOCOL_REGISTRY.aaveV3.assets[
      PROTOCOL_REGISTRY.curveStableSwapNg.pair.token0
    ].underlying.address;
    const inputIndex = isAddressEqual(pair.input.underlying.address, token0) ? 0n : 1n;
    const outputIndex = inputIndex === 0n ? 1n : 0n;
    const data = encodeFunctionData({
      abi: CURVE_STABLESWAP_NG_EXCHANGE_ABI,
      functionName: "exchange",
      args: [
        inputIndex,
        outputIndex,
        BigInt(parameters.amountInAtomic),
        BigInt(parameters.minimumOutputAtomic),
        program.executor,
      ],
    });
    return {
      capabilityId: "curve-stableswap-ng.exact-input",
      capabilityVersion: 1,
      target: PROTOCOL_REGISTRY.curveStableSwapNg.pair.pool.address,
      selector: selectorOf(data),
      data,
      spend: [{ token: pair.input.underlying.address, atomic: parameters.amountInAtomic }],
      guaranteedOutputs: [{
        token: pair.output.underlying.address,
        account: program.executor,
        minimumIncreaseAtomic: parameters.minimumOutputAtomic,
      }],
      deployments: pinned(
        PROTOCOL_REGISTRY.curveStableSwapNg.pair.pool,
        PROTOCOL_REGISTRY.curveStableSwapNg.plainImplementation,
        pair.input.underlying,
        pair.output.underlying,
      ),
      evidencePredicates: [{
        kind: "curve-stableswap-ng.exact-input",
        inputIndex: Number(inputIndex),
        outputIndex: Number(outputIndex),
        recipient: program.executor,
        minimumOutputAtomic: parameters.minimumOutputAtomic,
      }],
    };
  },
  verifyEvidence: () => [],
};
