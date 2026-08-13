import { PROTOCOL_REGISTRY, registryHash, type PinnedDeployment } from "../adapters/registry";

const capabilities = [{
  id: "aave-v3.supply",
  version: 1,
  policyAdapterId: "aave-v3@1",
  parameters: {
    asset: "registered ERC-20 address",
    amountAtomic: "positive base-unit amount",
  },
  semantics: "Supply the exact asset amount for the owner; receipt tokens accrue to the owner.",
}, {
  id: "curve-stableswap-ng.exact-input",
  version: 1,
  policyAdapterId: "curve-stableswap-ng@1",
  parameters: {
    tokenIn: "registered input ERC-20 address",
    tokenOut: "registered output ERC-20 address",
    amountInAtomic: "positive exact input base units",
    minimumOutputAtomic: "positive minimum output base units",
  },
  semantics: "Swap exact input in the registered pool and send output to the atomic executor.",
}, {
  id: "uniswap-v3.exact-input",
  version: 1,
  policyAdapterId: "uniswap-v3@1",
  parameters: {
    tokenIn: "registered input ERC-20 address",
    tokenOut: "registered output ERC-20 address",
    amountInAtomic: "positive exact input base units",
    minimumOutputAtomic: "positive minimum output base units",
  },
  semantics: "Swap exact input at the registered fee tier and send output to the atomic executor.",
}] as const;

function deploymentValues(): PinnedDeployment[] {
  const registry = PROTOCOL_REGISTRY;
  return [
    registry.aaveV3.addressesProvider,
    registry.aaveV3.pool,
    registry.aaveV3.dataProvider,
    registry.aaveV3.oracle,
    ...Object.values(registry.aaveV3.assets).flatMap(({ underlying, aToken }) => [underlying, aToken]),
    registry.curveStableSwapNg.factory,
    registry.curveStableSwapNg.views,
    registry.curveStableSwapNg.plainImplementation,
    registry.curveStableSwapNg.pair.pool,
    registry.uniswapV3.factory,
    registry.uniswapV3.quoterV2,
    registry.uniswapV3.swapRouter02,
    registry.uniswapV3.nonfungiblePositionManager,
    registry.uniswapV3.pair.pool,
  ];
}

export function productionCapabilityManifestV1() {
  const deployments = new Map<string, PinnedDeployment>();
  for (const deployment of deploymentValues()) {
    deployments.set(deployment.address.toLowerCase(), deployment);
  }
  return {
    version: 1 as const,
    chainId: 196 as const,
    registryHash,
    auditedAtBlock: PROTOCOL_REGISTRY.auditedAtBlock,
    capabilities,
    deployments: [...deployments.values()].sort((left, right) =>
      left.address.toLowerCase().localeCompare(right.address.toLowerCase())),
    officialSources: [
      "https://github.com/aave-dao/aave-address-book/tree/70e2f303fe93616784148d6827df6644e5dda4db",
      "https://github.com/curvefi/stableswap-ng/tree/2abe778f40206a6c0fd108a0a53ad3266cbedeee",
      "https://developers.uniswap.org/docs/protocols/v3/deployments/v3-xlayer-deployments",
    ],
  };
}
