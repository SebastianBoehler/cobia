import { isAddressEqual, type Address } from "viem";
import type { TrustedDeploymentManifestV1 } from "@cobia/solvers";
import { PROTOCOL_REGISTRY } from "../adapters/registry";

/** The only production capability enabled for the initial sandbox slice. */
export function codingAgentAaveManifestV1(asset: Address): TrustedDeploymentManifestV1 {
  const registered = Object.values(PROTOCOL_REGISTRY.aaveV3.assets).find(({ underlying }) =>
    isAddressEqual(underlying.address, asset));
  if (!registered) throw new Error("Asset is not in the Aave registry");
  return {
    version: 1,
    chainId: 196,
    deployments: [
      {
        ...registered.underlying,
        capability: {
          kind: "erc20-approve",
          approvalSpenders: [PROTOCOL_REGISTRY.aaveV3.pool.address],
        },
      },
      {
        ...PROTOCOL_REGISTRY.aaveV3.pool,
        capability: { kind: "aave-v3-supply" },
      },
    ],
  };
}
