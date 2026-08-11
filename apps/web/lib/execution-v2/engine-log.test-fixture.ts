import {
  decodeFunctionData,
  encodeAbiParameters,
  encodeEventTopics,
  zeroAddress,
  type Address,
  type Hash,
  type Hex,
} from "viem";
import { PROTOCOL_REGISTRY } from "../adapters/registry";
import { rayDivFloor, rayMulFloor } from "../adapters/aave-math";
import {
  AAVE_SUPPLY_EVENT_ABI,
  A_TOKEN_MINT_EVENT_ABI,
  ERC721_TRANSFER_EVENT_ABI,
  ERC20_APPROVAL_EVENT_ABI,
  NONFUNGIBLE_POSITION_MANAGER_EVENT_ABI,
  NONFUNGIBLE_POSITION_MANAGER_ABI,
  UNISWAP_SWAP_EVENT_ABI,
} from "./abis";
import type {
  ExecutionLogV2,
  ExecutionReceiptV2,
  ExecutionTransactionV2,
} from "./engine-types";
import { OUTPUT_ATOMIC, OWNER } from "./test-fixtures";
import { describeExecutionTransactionV2 } from "./transaction-descriptor";

export const RAY = 10n ** 27n;
const ZERO_HASH = `0x${"00".repeat(32)}` as Hash;

export function testBlockHash(blockNumber: bigint): Hash {
  return `0x${blockNumber.toString(16).padStart(64, "0")}`;
}

function eventLog(address: Address, topics: readonly Hex[], data: Hex): ExecutionLogV2 {
  return { address, topics, data };
}

function approvalSpender(transaction: ExecutionTransactionV2): Address {
  return decodeFunctionData({
    abi: [{
      type: "function", name: "approve", stateMutability: "nonpayable",
      inputs: [{ type: "address" }, { type: "uint256" }], outputs: [{ type: "bool" }],
    }],
    data: transaction.input,
  }).args[0];
}

function transactionLabel(transaction: ExecutionTransactionV2) {
  const selector = transaction.input.slice(0, 10);
  if (selector === "0x095ea7b3") {
    const amount = decodeFunctionData({
      abi: [{
        type: "function", name: "approve", stateMutability: "nonpayable",
        inputs: [{ type: "address" }, { type: "uint256" }], outputs: [{ type: "bool" }],
      }],
      data: transaction.input,
    }).args[1];
    const spender = approvalSpender(transaction);
    const aave = spender.toLowerCase() === pool.toLowerCase();
    const manager = spender.toLowerCase() ===
      PROTOCOL_REGISTRY.uniswapV3.nonfungiblePositionManager.address.toLowerCase();
    return amount === 0n
      ? (aave ? "reset-aave-allowance" : manager
        ? "reset-position-manager-allowance" : "reset-uniswap-allowance")
      : (aave ? "approve-aave-exact" : manager
        ? "approve-position-manager-exact" : "approve-uniswap-exact");
  }
  if (transaction.to?.toLowerCase() ===
    PROTOCOL_REGISTRY.uniswapV3.nonfungiblePositionManager.address.toLowerCase()) {
    return "uniswap-v3-full-range-mint";
  }
  return selector === "0x617ba037" ? "aave-v3-supply" : "uniswap-v3-exact-input";
}

export function protocolLogs(
  transaction: ExecutionTransactionV2,
  outputAtomic = OUTPUT_ATOMIC,
  aaveMintIndexRay = RAY,
  aaveScaledBalanceBefore = 0n,
) {
  if (!transaction.to) return [];
  const label = transactionLabel(transaction);
  const minimumLiquidity = label === "uniswap-v3-full-range-mint"
    ? (() => {
      const decoded = decodeFunctionData({
        abi: NONFUNGIBLE_POSITION_MANAGER_ABI,
        data: transaction.input,
      });
      if (decoded.functionName !== "mint") throw new Error("Expected LP mint");
      return decoded.args[0].amount0Min;
    })()
    : undefined;
  const descriptor = describeExecutionTransactionV2({
    label,
    chainId: 196,
    from: transaction.from,
    to: transaction.to,
    value: 0n,
    data: transaction.input,
    ...(minimumLiquidity ? { minimumLiquidity } : {}),
  });
  if (descriptor.kind === "allowance") {
    return [eventLog(
      descriptor.token,
      encodeEventTopics({
        abi: ERC20_APPROVAL_EVENT_ABI,
        eventName: "Approval",
        args: { owner: transaction.from, spender: descriptor.spender },
      }) as readonly Hex[],
      encodeAbiParameters([{ type: "uint256" }], [descriptor.expectedAtomic]),
    )];
  }
  if (descriptor.kind === "swap") {
    const token0 = PROTOCOL_REGISTRY.aaveV3.assets[
      PROTOCOL_REGISTRY.uniswapV3.pair.token0
    ].underlying.address;
    const inputIsToken0 = descriptor.tokenIn.toLowerCase() === token0.toLowerCase();
    return [eventLog(
      descriptor.pool,
      encodeEventTopics({
        abi: UNISWAP_SWAP_EVENT_ABI,
        eventName: "Swap",
        args: {
          sender: PROTOCOL_REGISTRY.uniswapV3.swapRouter02.address,
          recipient: transaction.from,
        },
      }) as readonly Hex[],
      encodeAbiParameters(
        [
          { type: "int256" }, { type: "int256" }, { type: "uint160" },
          { type: "uint128" }, { type: "int24" },
        ],
        inputIsToken0
          ? [descriptor.amountInAtomic, -outputAtomic, 1n, 1n, 0]
          : [-outputAtomic, descriptor.amountInAtomic, 1n, 1n, 0],
      ),
    )];
  }
  if (descriptor.kind === "uniswap-lp-mint") {
    const manager = PROTOCOL_REGISTRY.uniswapV3.nonfungiblePositionManager.address;
    const tokenId = 42n;
    return [
      eventLog(
        manager,
        encodeEventTopics({
          abi: ERC721_TRANSFER_EVENT_ABI,
          eventName: "Transfer",
          args: { from: zeroAddress, to: transaction.from, tokenId },
        }) as readonly Hex[],
        "0x",
      ),
      eventLog(
        manager,
        encodeEventTopics({
          abi: NONFUNGIBLE_POSITION_MANAGER_EVENT_ABI,
          eventName: "IncreaseLiquidity",
          args: { tokenId },
        }) as readonly Hex[],
        encodeAbiParameters(
          [{ type: "uint128" }, { type: "uint256" }, { type: "uint256" }],
          [
            descriptor.minimumLiquidity,
            descriptor.amount0DesiredAtomic,
            descriptor.amount1DesiredAtomic,
          ],
        ),
      ),
    ];
  }
  const scaledAmount = rayDivFloor(descriptor.suppliedAtomic, aaveMintIndexRay);
  const mintedUnderlying = rayMulFloor(
    aaveScaledBalanceBefore + scaledAmount,
    aaveMintIndexRay,
  ) - rayMulFloor(aaveScaledBalanceBefore, aaveMintIndexRay);
  return [
    eventLog(
      pool,
      encodeEventTopics({
        abi: AAVE_SUPPLY_EVENT_ABI,
        eventName: "Supply",
        args: {
          reserve: descriptor.asset,
          onBehalfOf: transaction.from,
          referralCode: 0,
        },
      }) as readonly Hex[],
      encodeAbiParameters(
        [{ type: "address" }, { type: "uint256" }],
        [transaction.from, descriptor.suppliedAtomic],
      ),
    ),
    eventLog(
      descriptor.aToken,
      encodeEventTopics({
        abi: A_TOKEN_MINT_EVENT_ABI,
        eventName: "Mint",
        args: { caller: transaction.from, onBehalfOf: transaction.from },
      }) as readonly Hex[],
      encodeAbiParameters(
        [{ type: "uint256" }, { type: "uint256" }, { type: "uint256" }],
        [mintedUnderlying, 0n, aaveMintIndexRay],
      ),
    ),
  ];
}

export function transactionHash(byte: number): Hash {
  return `0x${byte.toString(16).padStart(2, "0").repeat(32)}`;
}

export function successfulReceipt(blockNumber: bigint): ExecutionReceiptV2 {
  return {
    transactionHash: ZERO_HASH,
    status: "success",
    blockNumber,
    blockHash: testBlockHash(blockNumber),
    transactionIndex: 0,
    from: OWNER,
    to: null,
    logs: [],
  };
}

export function revertedReceipt(blockNumber: bigint): ExecutionReceiptV2 {
  return { ...successfulReceipt(blockNumber), status: "reverted" };
}

export const pool = PROTOCOL_REGISTRY.aaveV3.pool.address;
export const router = PROTOCOL_REGISTRY.uniswapV3.swapRouter02.address;
export const aUsdt0 = PROTOCOL_REGISTRY.aaveV3.assets.USDt0.aToken.address;
export const aUsdg = PROTOCOL_REGISTRY.aaveV3.assets.USDG.aToken.address;
