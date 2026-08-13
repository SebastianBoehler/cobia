import type { CapabilityModuleV1 } from "@cobia/solvers";
import { encodeFunctionData } from "viem";
import { z } from "zod";
import { PROTOCOL_REGISTRY } from "../adapters/registry";
import { AAVE_POOL_SUPPLY_ABI } from "../execution-v2/abis";
import {
  AddressSchema,
  PositiveAtomicSchema,
  assertProductionManifest,
  pinned,
  registeredAsset,
  selectorOf,
} from "./shared";

const ParametersSchema = z.object({
  asset: AddressSchema,
  amountAtomic: PositiveAtomicSchema,
}).strict();
type Parameters = z.infer<typeof ParametersSchema>;

export const aaveSupplyCapabilityV1: CapabilityModuleV1<Parameters> = {
  id: "aave-v3.supply",
  version: 1,
  parseParameters: (input) => ParametersSchema.parse(input),
  compile({ program, parameters, manifest }) {
    assertProductionManifest(manifest, program.manifestHash);
    const asset = registeredAsset(parameters.asset);
    const amount = BigInt(parameters.amountAtomic);
    const minimumReceipt = amount > 1n ? amount - 1n : amount;
    const data = encodeFunctionData({
      abi: AAVE_POOL_SUPPLY_ABI,
      functionName: "supply",
      args: [asset.underlying.address, amount, program.owner, 0],
    });
    return {
      capabilityId: "aave-v3.supply",
      capabilityVersion: 1,
      target: PROTOCOL_REGISTRY.aaveV3.pool.address,
      selector: selectorOf(data),
      data,
      spend: [{ token: asset.underlying.address, atomic: parameters.amountAtomic }],
      guaranteedOutputs: [{
        token: asset.aToken.address,
        account: program.owner,
        minimumIncreaseAtomic: minimumReceipt.toString(),
      }],
      deployments: pinned(
        PROTOCOL_REGISTRY.aaveV3.pool,
        asset.underlying,
        asset.aToken,
      ),
      evidencePredicates: [{
        kind: "aave-v3.supply",
        asset: asset.underlying.address,
        owner: program.owner,
        amountAtomic: parameters.amountAtomic,
      }],
    };
  },
  verifyEvidence: () => [],
};
