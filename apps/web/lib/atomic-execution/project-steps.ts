import type { RouteLegV2 } from "@cobia/domain";
import { encodeFunctionData, isAddressEqual, keccak256, stringToHex, type Address } from "viem";
import { PROTOCOL_REGISTRY } from "../adapters/registry";
import {
  AAVE_POOL_SUPPLY_ABI,
  CURVE_STABLESWAP_NG_EXCHANGE_ABI,
  SWAP_ROUTER02_ABI,
} from "../execution-v2/abis";
import {
  registeredCurveSwap,
  registeredExecutionAsset,
  registeredSwapPair,
} from "../execution-v2/execution-context";
import type { AtomicBalanceConstraintV1, AtomicStepV1 } from "./types";

function adapterHash(adapterId: string) {
  return keccak256(stringToHex(adapterId));
}

function aaveOutput(
  assetAddress: Address,
  owner: Address,
  amount: bigint,
): { step: AtomicStepV1; constraint: AtomicBalanceConstraintV1 } {
  if (amount <= 1n) throw new Error("Atomic Aave output amount is too small");
  const asset = registeredExecutionAsset(assetAddress);
  return {
    step: {
      adapterId: adapterHash(PROTOCOL_REGISTRY.aaveV3.adapterId),
      target: PROTOCOL_REGISTRY.aaveV3.pool.address,
      spendToken: asset.address,
      spendAmount: amount,
      data: encodeFunctionData({
        abi: AAVE_POOL_SUPPLY_ABI,
        functionName: "supply",
        args: [asset.address, amount, owner, 0],
      }),
    },
    constraint: {
      token: asset.aToken,
      account: owner,
      minimumIncrease: amount - 1n,
    },
  };
}

export function projectAtomicStepsV1(input: {
  leg: RouteLegV2;
  inputAsset: Address;
  owner: Address;
  executor: Address;
  deadline: number;
}) {
  const [first, second] = input.leg.actions;
  const inputAmount = BigInt(input.leg.inputAtomic);
  if (first.kind === "aave-v3-supply") {
    if (second || !isAddressEqual(first.asset, input.inputAsset)) {
      throw new Error("Atomic direct Aave route is invalid");
    }
    const output = aaveOutput(first.asset, input.owner, inputAmount);
    return { steps: [output.step], constraint: output.constraint };
  }
  if ((first.kind !== "curve-stableswap-ng-exact-input" &&
    first.kind !== "uniswap-v3-exact-input") ||
    !second || second.kind !== "aave-v3-supply" ||
    !isAddressEqual(first.tokenIn, input.inputAsset) ||
    !isAddressEqual(first.tokenOut, second.asset)) {
    throw new Error("Atomic swap must be followed by matching Aave supply");
  }
  const minimumOutput = BigInt(first.minimumOutputAtomic);
  if (minimumOutput > BigInt(first.quotedOutputAtomic)) {
    throw new Error("Atomic swap minimum exceeds its quote");
  }
  const output = aaveOutput(second.asset, input.owner, minimumOutput);
  if (first.kind === "curve-stableswap-ng-exact-input") {
    const pair = registeredCurveSwap(
      first.tokenIn,
      first.tokenOut,
      first.pool,
      first.inputIndex,
      first.outputIndex,
    );
    if (first.fee !== PROTOCOL_REGISTRY.curveStableSwapNg.pair.fee) {
      throw new Error("Atomic Curve fee is not registered");
    }
    return {
      steps: [{
        adapterId: adapterHash(PROTOCOL_REGISTRY.curveStableSwapNg.adapterId),
        target: pair.pool,
        spendToken: pair.input.address,
        spendAmount: inputAmount,
        data: encodeFunctionData({
          abi: CURVE_STABLESWAP_NG_EXCHANGE_ABI,
          functionName: "exchange",
          args: [
            BigInt(first.inputIndex),
            BigInt(first.outputIndex),
            inputAmount,
            minimumOutput,
            input.executor,
          ],
        }),
      }, output.step],
      constraint: output.constraint,
    };
  }
  const pair = registeredSwapPair(first.tokenIn, first.tokenOut);
  const swap = encodeFunctionData({
    abi: SWAP_ROUTER02_ABI,
    functionName: "exactInputSingle",
    args: [{
      tokenIn: pair.input.address,
      tokenOut: pair.output.address,
      fee: pair.fee,
      recipient: input.executor,
      amountIn: inputAmount,
      amountOutMinimum: minimumOutput,
      sqrtPriceLimitX96: 0n,
    }],
  });
  return {
    steps: [{
      adapterId: adapterHash(PROTOCOL_REGISTRY.uniswapV3.adapterId),
      target: PROTOCOL_REGISTRY.uniswapV3.swapRouter02.address,
      spendToken: pair.input.address,
      spendAmount: inputAmount,
      data: encodeFunctionData({
        abi: SWAP_ROUTER02_ABI,
        functionName: "multicall",
        args: [BigInt(input.deadline), [swap]],
      }),
    }, output.step],
    constraint: output.constraint,
  };
}
