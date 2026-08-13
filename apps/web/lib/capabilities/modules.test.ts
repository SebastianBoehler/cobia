import {
  CapabilityProgramV1Schema,
  type CapabilityModuleV1,
  type CapabilityProgramV1,
} from "@cobia/solvers";
import { decodeFunctionData } from "viem";
import { describe, expect, it } from "vitest";
import { PROTOCOL_REGISTRY, registryHash } from "../adapters/registry";
import {
  AAVE_POOL_SUPPLY_ABI,
  CURVE_STABLESWAP_NG_EXCHANGE_ABI,
  SWAP_ROUTER02_ABI,
} from "../execution-v2/abis";
import { aaveSupplyCapabilityV1 } from "./aave-supply";
import { curveExactInputCapabilityV1 } from "./curve-exact-input";
import { productionCapabilityRegistryV1 } from "./registry";
import { uniswapExactInputCapabilityV1 } from "./uniswap-exact-input";

const owner = "0x1111111111111111111111111111111111111111";
const executor = "0x2222222222222222222222222222222222222222";
const usdg = PROTOCOL_REGISTRY.aaveV3.assets.USDG.underlying.address;
const usdt0 = PROTOCOL_REGISTRY.aaveV3.assets.USDt0.underlying.address;

const program = CapabilityProgramV1Schema.parse({
  version: 1,
  requestId: "b1946b6f-aad8-45a6-96dd-d138b55c7710",
  chainId: 196,
  policyHash: `0x${"11".repeat(32)}`,
  manifestHash: registryHash,
  owner,
  executor,
  pinnedBlock: {
    number: PROTOCOL_REGISTRY.auditedAtBlock.number,
    hash: PROTOCOL_REGISTRY.auditedAtBlock.hash,
  },
  deadline: 2_000_000_000,
  nonce: `0x${"44".repeat(32)}`,
  input: { token: usdg, atomic: "10000000" },
  actions: [{
    capabilityId: "aave-v3.supply",
    capabilityVersion: 1,
    valueAtomic: "0",
    parameters: { asset: usdg, amountAtomic: "10000000" },
  }],
  constraints: [{
    token: PROTOCOL_REGISTRY.aaveV3.assets.USDG.aToken.address,
    account: owner,
    minimumIncreaseAtomic: "9999999",
  }],
});

function compile<T>(module: CapabilityModuleV1<T>, parameters: unknown) {
  const parsed = module.parseParameters(parameters);
  return module.compile({
    program,
    actionIndex: 0,
    parameters: parsed,
    manifest: { registryHash },
  });
}

describe("Aave supply capability", () => {
  it("constructs owner-bound supply calldata and receipt-token evidence", () => {
    const compiled = compile(aaveSupplyCapabilityV1, {
      asset: usdg,
      amountAtomic: "10000000",
    });
    const decoded = decodeFunctionData({ abi: AAVE_POOL_SUPPLY_ABI, data: compiled.data });

    expect(decoded.args).toEqual([usdg, 10_000_000n, owner, 0]);
    expect(compiled.spend).toEqual([{ token: usdg, atomic: "10000000" }]);
    expect(compiled.guaranteedOutputs).toEqual([{
      token: PROTOCOL_REGISTRY.aaveV3.assets.USDG.aToken.address,
      account: owner,
      minimumIncreaseAtomic: "9999999",
    }]);
  });

  it("does not let the agent choose recipient or referral semantics", () => {
    expect(() => aaveSupplyCapabilityV1.parseParameters({
      asset: usdg,
      amountAtomic: "10000000",
      onBehalfOf: executor,
    })).toThrow();
  });
});

describe("Uniswap exact-input capability", () => {
  it("fixes the recipient and fee from the verifier registry", () => {
    const compiled = compile(uniswapExactInputCapabilityV1, {
      tokenIn: usdg,
      tokenOut: usdt0,
      amountInAtomic: "10000000",
      minimumOutputAtomic: "9900000",
    });
    const decoded = decodeFunctionData({ abi: SWAP_ROUTER02_ABI, data: compiled.data });

    expect(decoded.args[0]).toMatchObject({
      tokenIn: usdg,
      tokenOut: usdt0,
      fee: PROTOCOL_REGISTRY.uniswapV3.pair.fee,
      recipient: executor,
      amountIn: 10_000_000n,
      amountOutMinimum: 9_900_000n,
    });
    expect(compiled.guaranteedOutputs[0]).toMatchObject({
      token: usdt0,
      account: executor,
      minimumIncreaseAtomic: "9900000",
    });
  });

  it("rejects agent-selected fees and unregistered assets", () => {
    expect(() => uniswapExactInputCapabilityV1.parseParameters({
      tokenIn: usdg, tokenOut: usdt0,
      amountInAtomic: "10000000", minimumOutputAtomic: "9900000", fee: 3_000,
    })).toThrow();
    expect(() => compile(uniswapExactInputCapabilityV1, {
      tokenIn: usdg,
      tokenOut: "0x9999999999999999999999999999999999999999",
      amountInAtomic: "10000000",
      minimumOutputAtomic: "9900000",
    })).toThrow("registered");
  });
});

describe("Curve exact-input capability", () => {
  it("binds pool indices and receiver to the registered pair", () => {
    const compiled = compile(curveExactInputCapabilityV1, {
      tokenIn: usdg,
      tokenOut: usdt0,
      amountInAtomic: "10000000",
      minimumOutputAtomic: "9900000",
    });
    const decoded = decodeFunctionData({
      abi: CURVE_STABLESWAP_NG_EXCHANGE_ABI,
      data: compiled.data,
    });

    expect(decoded.args).toEqual([0n, 1n, 10_000_000n, 9_900_000n, executor]);
    expect(compiled.target).toBe(PROTOCOL_REGISTRY.curveStableSwapNg.pair.pool.address);
  });

  it("does not accept an agent-selected pool, receiver, or index", () => {
    expect(() => curveExactInputCapabilityV1.parseParameters({
      tokenIn: usdg, tokenOut: usdt0,
      amountInAtomic: "10000000", minimumOutputAtomic: "9900000",
      pool: executor, inputIndex: 1,
    })).toThrow();
  });
});

describe("production capability registry", () => {
  it("contains modules, not route-family branches", () => {
    expect(productionCapabilityRegistryV1.list().map((module) =>
      `${module.id}@${module.version}`)).toEqual([
      "aave-v3.supply@1",
      "curve-stableswap-ng.exact-input@1",
      "uniswap-v3.exact-input@1",
    ]);
    expect(() => productionCapabilityRegistryV1.resolve("compound-v3.supply", 1))
      .toThrow("Unsupported capability");
  });
});
