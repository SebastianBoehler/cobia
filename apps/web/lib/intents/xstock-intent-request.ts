import { getAddress, isAddressEqual, type Address, type Hash } from "viem";
import { decimalToAtomic } from "./capability-templates";
import type {
  XStocksInstrumentV1,
  XStocksToolValueV1,
} from "../solver-tools/xstocks";
import type { SolverToolResultV1 } from "../solver-tools/types";

interface XStocksReader {
  run(input: { operation: "get"; symbol: string }): Promise<SolverToolResultV1<XStocksToolValueV1>>;
}

type Resolution =
  | { status: "not-requested" }
  | { status: "clarification"; question: string }
  | {
      status: "resolved";
      sourceHash: Hash;
      symbol: string;
      input: { chainId: 196; address: Address; maximumAtomic: string };
      output: { chainId: 196; address: Address; minimumAtomic: string };
    };

function taggedXStockSymbols(goal: string): string[] {
  const matches = [...goal.matchAll(/@([A-Za-z0-9.]{1,15}x)(?=$|[^A-Za-z0-9.])/gi)]
    .map((match) => `${match[1]!.slice(0, -1).toUpperCase()}x`);
  return matches.filter((symbol, index) => matches.findIndex((candidate) =>
    candidate.toLowerCase() === symbol.toLowerCase()) === index);
}

function boundedAmount(goal: string, bound: "at most" | "at least", symbol: string): string | undefined {
  return goal.match(new RegExp(
    `\\b${bound}\\s+(\\d+(?:\\.\\d+)?)\\s+@?${symbol}(?=$|[^A-Za-z0-9.])`, "i",
  ))?.[1];
}

function supportedInstrument(
  assets: readonly XStocksInstrumentV1[],
  symbol: string,
): XStocksInstrumentV1 | undefined {
  const matches = assets.filter((asset) => asset.symbol.toLowerCase() === symbol.toLowerCase());
  return matches.length === 1 ? matches[0] : undefined;
}

export async function resolveXStockIntentRequestV1(input: {
  goal: string;
  tool: XStocksReader;
  usdgAddress: Address;
}): Promise<Resolution> {
  const symbols = taggedXStockSymbols(input.goal);
  if (symbols.length === 0) return { status: "not-requested" };
  if (symbols.length !== 1) return { status: "clarification",
    question: "Tag exactly one xStock output per intent." };

  const requestedSymbol = symbols[0]!;
  const result = await input.tool.run({ operation: "get", symbol: requestedSymbol });
  if (result.status !== "ok") return { status: "clarification",
    question: "The official xStocks catalog could not verify that instrument. Try again." };
  const instrument = supportedInstrument(result.value.assets, requestedSymbol);
  const stablecoin = instrument?.deployment.stablecoins.find(({ symbol, address }) =>
    symbol === "USDG" && isAddressEqual(address, input.usdgAddress));
  if (!instrument || instrument.isTradingHalted || !instrument.deployment.supportsAtomicSwaps ||
      !stablecoin?.supportsAtomicSwaps) {
    return { status: "clarification",
      question: "That xStock is not currently available for atomic USDG routing on X Layer." };
  }

  const maximum = boundedAmount(input.goal, "at most", "USDG");
  const minimum = boundedAmount(input.goal, "at least", instrument.symbol);
  const maximumAtomic = maximum && decimalToAtomic(maximum, stablecoin.decimals);
  const minimumAtomic = minimum && decimalToAtomic(minimum, 18);
  if (!maximumAtomic || !minimumAtomic) return { status: "clarification",
    question: `State both an "at most" USDG amount and an "at least" ${instrument.symbol} amount.` };

  return {
    status: "resolved",
    sourceHash: result.sourceHash,
    symbol: instrument.symbol,
    input: { chainId: 196,
      address: getAddress(input.usdgAddress).toLowerCase() as Address, maximumAtomic },
    output: { chainId: 196,
      address: getAddress(instrument.deployment.address).toLowerCase() as Address, minimumAtomic },
  };
}
