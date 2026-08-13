import { createCapabilityRegistryV1 } from "@cobia/solvers";
import { aaveSupplyCapabilityV1 } from "./aave-supply";
import { curveExactInputCapabilityV1 } from "./curve-exact-input";
import { uniswapExactInputCapabilityV1 } from "./uniswap-exact-input";

export const productionCapabilityRegistryV1 = createCapabilityRegistryV1([
  aaveSupplyCapabilityV1,
  curveExactInputCapabilityV1,
  uniswapExactInputCapabilityV1,
]);
