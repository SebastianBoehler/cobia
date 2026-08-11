import { decodeEventLog, isAddressEqual } from "viem";
import { PROTOCOL_REGISTRY } from "../adapters/registry";
import {
  AAVE_SUPPLY_EVENT_ABI,
  A_TOKEN_MINT_EVENT_ABI,
  CURVE_TOKEN_EXCHANGE_EVENT_ABI,
  ERC721_TRANSFER_EVENT_ABI,
  ERC20_APPROVAL_EVENT_ABI,
  NONFUNGIBLE_POSITION_MANAGER_EVENT_ABI,
  UNISWAP_SWAP_EVENT_ABI,
} from "./abis";
import { ExecutionStepErrorV2 } from "./execution-errors";
import type {
  ExecutionLogV2,
  ExecutionProtocolEvidenceV2,
  ExecutionReceiptV2,
} from "./engine-types";
import {
  describeExecutionTransactionV2,
  type ExecutionTransactionDescriptorV2,
} from "./transaction-descriptor";
import type { OwnerTransactionV2 } from "./types";

function logsAt(receipt: ExecutionReceiptV2, address: `0x${string}`) {
  return receipt.logs.filter((log) => isAddressEqual(log.address, address));
}

function lpMintEvidence(
  descriptor: Extract<ExecutionTransactionDescriptorV2, { kind: "uniswap-lp-mint" }>,
  transaction: OwnerTransactionV2,
  receipt: ExecutionReceiptV2,
): ExecutionProtocolEvidenceV2 {
  const manager = PROTOCOL_REGISTRY.uniswapV3.nonfungiblePositionManager.address;
  const transfers = decodedLogs(logsAt(receipt, manager), ERC721_TRANSFER_EVENT_ABI);
  const increases = decodedLogs(
    logsAt(receipt, manager),
    NONFUNGIBLE_POSITION_MANAGER_EVENT_ABI,
  );
  for (const transfer of transfers) {
    if (transfer.eventName !== "Transfer") continue;
    const transferArgs = transfer.args as {
      from: `0x${string}`; to: `0x${string}`; tokenId: bigint;
    };
    if (transferArgs.from !== "0x0000000000000000000000000000000000000000" ||
      !isAddressEqual(transferArgs.to, transaction.from)) continue;
    const increase = increases.find((event) => {
      if (event.eventName !== "IncreaseLiquidity") return false;
      const args = event.args as {
        tokenId: bigint; liquidity: bigint; amount0: bigint; amount1: bigint;
      };
      return args.tokenId === transferArgs.tokenId &&
        args.liquidity >= descriptor.minimumLiquidity &&
        args.amount0 >= descriptor.amount0MinAtomic &&
        args.amount0 <= descriptor.amount0DesiredAtomic &&
        args.amount1 >= descriptor.amount1MinAtomic &&
        args.amount1 <= descriptor.amount1DesiredAtomic;
    });
    if (!increase || increase.eventName !== "IncreaseLiquidity") continue;
    const args = increase.args as {
      liquidity: bigint; amount0: bigint; amount1: bigint;
    };
    return {
      kind: "uniswap-lp-mint",
      tokenId: transferArgs.tokenId,
      liquidity: args.liquidity,
      amount0Atomic: args.amount0,
      amount1Atomic: args.amount1,
    };
  }
  throw new ExecutionStepErrorV2(
    "protocol-event-missing",
    "Receipt is missing the exact bounded Uniswap LP mint events",
  );
}

function decodedLogs(
  logs: readonly ExecutionLogV2[],
  abi: Parameters<typeof decodeEventLog>[0]["abi"],
) {
  return logs.flatMap((log) => {
    try {
      return [decodeEventLog({ abi, data: log.data, topics: log.topics as never })];
    } catch {
      return [];
    }
  });
}

function approvalEvidence(
  descriptor: Extract<ExecutionTransactionDescriptorV2, { kind: "allowance" }>,
  transaction: OwnerTransactionV2,
  receipt: ExecutionReceiptV2,
): ExecutionProtocolEvidenceV2 {
  const match = decodedLogs(
    logsAt(receipt, descriptor.token),
    ERC20_APPROVAL_EVENT_ABI,
  ).find((event) => {
    if (event.eventName !== "Approval") return false;
    const args = event.args as { owner: `0x${string}`; spender: `0x${string}`; value: bigint };
    return isAddressEqual(args.owner, transaction.from) &&
      isAddressEqual(args.spender, descriptor.spender) &&
      args.value === descriptor.expectedAtomic;
  });
  if (!match) {
    throw new ExecutionStepErrorV2(
      "protocol-event-missing",
      "Receipt is missing the exact ERC20 Approval event",
    );
  }
  return {
    kind: "approval",
    owner: transaction.from,
    spender: descriptor.spender,
    amountAtomic: descriptor.expectedAtomic,
  };
}

function uniswapSwapEvidence(
  descriptor: Extract<ExecutionTransactionDescriptorV2, {
    kind: "swap"; venue: "uniswap-v3";
  }>,
  transaction: OwnerTransactionV2,
  receipt: ExecutionReceiptV2,
): ExecutionProtocolEvidenceV2 {
  for (const event of decodedLogs(
    logsAt(receipt, descriptor.pool),
    UNISWAP_SWAP_EVENT_ABI,
  )) {
    if (event.eventName !== "Swap") continue;
    const args = event.args as {
      sender: `0x${string}`;
      recipient: `0x${string}`;
      amount0: bigint;
      amount1: bigint;
    };
    if (!isAddressEqual(args.sender, PROTOCOL_REGISTRY.uniswapV3.swapRouter02.address) ||
      !isAddressEqual(args.recipient, transaction.from)) continue;
    const token0 = PROTOCOL_REGISTRY.aaveV3.assets[
      PROTOCOL_REGISTRY.uniswapV3.pair.token0
    ].underlying.address;
    const inputIsToken0 = isAddressEqual(descriptor.tokenIn, token0);
    const inputAtomic = inputIsToken0 ? args.amount0 : args.amount1;
    const outputSigned = inputIsToken0 ? args.amount1 : args.amount0;
    if (inputAtomic !== descriptor.amountInAtomic || outputSigned >= 0n) continue;
    const outputAtomic = -outputSigned;
    if (outputAtomic < descriptor.minimumOutputAtomic) continue;
    return {
      kind: "swap",
      venue: descriptor.venue,
      sender: args.sender,
      recipient: args.recipient,
      inputAtomic,
      outputAtomic,
    };
  }
  throw new ExecutionStepErrorV2(
    "protocol-event-missing",
    "Receipt is missing the signed Uniswap pool Swap event",
  );
}

function curveSwapEvidence(
  descriptor: Extract<ExecutionTransactionDescriptorV2, {
    kind: "swap"; venue: "curve-stableswap-ng";
  }>,
  transaction: OwnerTransactionV2,
  receipt: ExecutionReceiptV2,
): ExecutionProtocolEvidenceV2 {
  for (const event of decodedLogs(
    logsAt(receipt, descriptor.pool),
    CURVE_TOKEN_EXCHANGE_EVENT_ABI,
  )) {
    if (event.eventName !== "TokenExchange") continue;
    const args = event.args as {
      buyer: `0x${string}`;
      soldId: bigint;
      tokensSold: bigint;
      boughtId: bigint;
      tokensBought: bigint;
    };
    if (!isAddressEqual(args.buyer, transaction.from) ||
      args.soldId !== BigInt(descriptor.inputIndex) ||
      args.boughtId !== BigInt(descriptor.outputIndex) ||
      args.tokensSold !== descriptor.amountInAtomic ||
      args.tokensBought < descriptor.minimumOutputAtomic) continue;
    return {
      kind: "swap",
      venue: descriptor.venue,
      sender: args.buyer,
      recipient: transaction.from,
      inputAtomic: args.tokensSold,
      outputAtomic: args.tokensBought,
    };
  }
  throw new ExecutionStepErrorV2(
    "protocol-event-missing",
    "Receipt is missing the exact Curve TokenExchange event",
  );
}

function swapEvidence(
  descriptor: Extract<ExecutionTransactionDescriptorV2, { kind: "swap" }>,
  transaction: OwnerTransactionV2,
  receipt: ExecutionReceiptV2,
): ExecutionProtocolEvidenceV2 {
  return descriptor.venue === "curve-stableswap-ng"
    ? curveSwapEvidence(descriptor, transaction, receipt)
    : uniswapSwapEvidence(descriptor, transaction, receipt);
}

function aaveEvidence(
  descriptor: Extract<ExecutionTransactionDescriptorV2, { kind: "aave-supply" }>,
  transaction: OwnerTransactionV2,
  receipt: ExecutionReceiptV2,
): ExecutionProtocolEvidenceV2 {
  const supply = decodedLogs(
    logsAt(receipt, PROTOCOL_REGISTRY.aaveV3.pool.address),
    AAVE_SUPPLY_EVENT_ABI,
  ).find((event) => {
    if (event.eventName !== "Supply") return false;
    const args = event.args as {
      reserve: `0x${string}`;
      user: `0x${string}`;
      onBehalfOf: `0x${string}`;
      amount: bigint;
      referralCode: number;
    };
    return isAddressEqual(args.reserve, descriptor.asset) &&
      isAddressEqual(args.user, transaction.from) &&
      isAddressEqual(args.onBehalfOf, transaction.from) &&
      args.amount === descriptor.suppliedAtomic && args.referralCode === 0;
  });
  const mint = decodedLogs(
    logsAt(receipt, descriptor.aToken),
    A_TOKEN_MINT_EVENT_ABI,
  ).find((event) => {
    if (event.eventName !== "Mint") return false;
    const args = event.args as {
      caller: `0x${string}`;
      onBehalfOf: `0x${string}`;
      value: bigint;
      balanceIncrease: bigint;
      index: bigint;
    };
    return isAddressEqual(args.caller, transaction.from) &&
      isAddressEqual(args.onBehalfOf, transaction.from) &&
      args.index > 0n && args.value >= args.balanceIncrease;
  });
  if (!supply || !mint || mint.eventName !== "Mint") {
    throw new ExecutionStepErrorV2(
      "protocol-event-missing",
      "Receipt is missing exact Aave Supply and aToken Mint events",
    );
  }
  const args = mint.args as { value: bigint; balanceIncrease: bigint; index: bigint };
  return {
    kind: "aave-supply",
    suppliedAtomic: descriptor.suppliedAtomic,
    mintValueAtomic: args.value,
    mintBalanceIncreaseAtomic: args.balanceIncrease,
    mintIndexRay: args.index,
  };
}

// Event shapes come directly from the official Aave, Curve, and Uniswap interfaces:
// https://github.com/aave-dao/aave-v3-origin/blob/cff15de6d1271b0c800fc001f4aea4c263e8a597/src/contracts/interfaces/IPool.sol
// https://github.com/curvefi/stableswap-ng/tree/2abe778f40206a6c0fd108a0a53ad3266cbedeee/contracts/main
// https://github.com/Uniswap/v3-core/blob/main/contracts/interfaces/pool/IUniswapV3PoolEvents.sol
export function validateProtocolEventsV2(
  transaction: OwnerTransactionV2,
  receipt: ExecutionReceiptV2,
): ExecutionProtocolEvidenceV2 {
  const descriptor = describeExecutionTransactionV2(transaction);
  if (descriptor.kind === "allowance") {
    return approvalEvidence(descriptor, transaction, receipt);
  }
  if (descriptor.kind === "swap") return swapEvidence(descriptor, transaction, receipt);
  if (descriptor.kind === "uniswap-lp-mint") {
    return lpMintEvidence(descriptor, transaction, receipt);
  }
  return aaveEvidence(descriptor, transaction, receipt);
}
