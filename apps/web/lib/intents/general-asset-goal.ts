import { isNativeAssetAddress } from "@cobia/domain";
import type { Address } from "viem";
import { decimalToAtomic } from "./capability-templates";

export interface GoalAssetReference {
  symbol: string;
  chainId: 1 | 196;
  address: Address;
  decimals: number;
}

type Result =
  | { status: "not-applicable" }
  | { status: "clarification"; question: string }
  | {
      status: "request";
      input: { chainId: 1 | 196; address: Address; maximumAtomic: string };
      output: { chainId: 1 | 196; address: Address; minimumAtomic: string };
    };

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function amountBeforeSymbol(goal: string, symbol: string, prefix = ""): string | undefined {
  return new RegExp(`${prefix}\\s*(\\d+(?:\\.\\d+)?)\\s+@?${escapeRegExp(symbol)}(?=$|[^A-Za-z0-9])`, "i")
    .exec(goal)?.[1];
}

export function generalAssetRequestFromGoal(
  goal: string,
  assets: readonly GoalAssetReference[],
  registeredSymbols: readonly string[],
): Result {
  const requested = assets.filter(({ symbol }, index) => assets.findIndex((candidate) =>
    candidate.symbol.toLowerCase() === symbol.toLowerCase()) === index).filter(({ symbol }) =>
    new RegExp(`@${escapeRegExp(symbol)}(?=$|[^A-Za-z0-9])`, "i").test(goal));
  if (requested.length !== 2 || requested.every(({ symbol }) => registeredSymbols.some((registered) =>
    registered.toLowerCase() === symbol.toLowerCase()))) return { status: "not-applicable" };

  const output = requested.find(({ symbol }) => amountBeforeSymbol(goal, symbol, "\\bat least"));
  const input = requested.find(({ symbol }) => symbol.toLowerCase() !== output?.symbol.toLowerCase());
  if (!input || !output) return { status: "clarification",
    question: "For an unregistered ERC-20 or xStock, state an exact input and an \"at least\" output amount." };
  if (isNativeAssetAddress(input.address)) return { status: "clarification",
    question: "Arbitrary xStocks currently require an ERC-20 input; native OKB is not yet verified for this route." };
  const maximumAtomic = decimalToAtomic(amountBeforeSymbol(goal, input.symbol) ?? "", input.decimals);
  const minimumAtomic = decimalToAtomic(amountBeforeSymbol(goal, output.symbol, "\\bat least") ?? "", output.decimals);
  if (!maximumAtomic || !minimumAtomic) return { status: "clarification",
    question: "For an unregistered ERC-20 or xStock, state an exact input and an \"at least\" output amount." };
  return { status: "request", input: { chainId: input.chainId, address: input.address, maximumAtomic },
    output: { chainId: output.chainId, address: output.address, minimumAtomic } };
}
