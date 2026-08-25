import { createPublicClient, erc20Abi, formatUnits, http, type Address } from "viem";
import { SUPPORTED_ASSETS } from "../chain/supported-assets";
import { readOkxCredentials } from "../env";
import { createOkxClient } from "../okx/client";
import { createOkxPortfolioAnalyticsClient } from "../okx/portfolio-analytics";
import { xLayerTestnet } from "../chain/xlayer-testnet";
import { USDT_A_TOKEN, USDG_A_TOKEN, xLayer } from "../chain/xlayer";
import { readIndexedPortfolioAnalytics, type IndexedPortfolioAnalytics } from
  "./read-indexed-analytics";

export type PortfolioChainId = 196 | 1952;

export interface PortfolioSnapshot {
  address: Address;
  chainId: PortfolioChainId;
  networkName: "X Layer Mainnet" | "X Layer Testnet";
  blockNumber: string;
  observedAt: string;
  native: { symbol: "OKB"; amountAtomic: string; formatted: string };
  balances: Array<{ address: Address; symbol: string; decimals: number; amountAtomic: string;
    formatted: string; priceUsd?: string }>;
  positions: Array<{
    adapterId: "aave-v3@1";
    symbol: "aUSDG" | "aUSDt0";
    amountAtomic: string;
    formatted: string;
  }>;
  analytics: IndexedPortfolioAnalytics;
}

export async function readPortfolio(
  address: Address,
  chainId: PortfolioChainId = 196,
  rpcUrl?: string,
): Promise<PortfolioSnapshot> {
  const chain = chainId === 1952 ? xLayerTestnet : xLayer;
  const endpoint = rpcUrl ?? (chainId === 1952
    ? process.env.XLAYER_TESTNET_RPC_URL ?? xLayerTestnet.rpcUrls.default.http[0]
    : process.env.XLAYER_RPC_URL ?? xLayer.rpcUrls.default.http[0]);
  const client = createPublicClient({ chain, transport: http(endpoint, { timeout: 10_000 }) });
  const blockNumber = await client.getBlockNumber();
  const native = await client.getBalance({ address, blockNumber });
  if (chainId === 1952) return {
    address,
    chainId,
    networkName: "X Layer Testnet",
    blockNumber: blockNumber.toString(),
    observedAt: new Date().toISOString(),
    native: { symbol: "OKB", amountAtomic: native.toString(), formatted: formatUnits(native, 18) },
    balances: [],
    positions: [],
    analytics: { status: "not_applicable", source: "okx-indexed",
      message: "Indexed analytics are available on X Layer Mainnet only." },
  };
  const credentials = readOkxCredentials();
  const [listed, analytics] = await Promise.all([
    createOkxClient({ credentials }).listXLayerTokenBalances(address),
    readIndexedPortfolioAnalytics(createOkxPortfolioAnalyticsClient({ credentials }), address),
  ]);
  const known = new Map(SUPPORTED_ASSETS.map((asset) => [asset.address.toLowerCase(), asset]));
  const tokens = [...new Map<string, { address: Address; symbol: string; decimals?: number }>([
    ...SUPPORTED_ASSETS.map((asset) => [asset.address.toLowerCase(), { address: asset.address,
      symbol: asset.displaySymbol, decimals: asset.decimals }] as const),
    ...listed.map((asset) => [asset.token.toLowerCase(), { address: asset.token, symbol: asset.symbol }] as const),
  ]).values()];
  const [balances, aUsdG, aUsdT0] = await Promise.all([
    Promise.all(tokens.map(async (token) => {
      const registered = known.get(token.address.toLowerCase());
      const [amount, decimals, symbol] = await Promise.all([
        client.readContract({ address: token.address, abi: erc20Abi, functionName: "balanceOf",
          args: [address], blockNumber }),
        registered ? Promise.resolve(registered.decimals) : client.readContract({ address: token.address,
          abi: erc20Abi, functionName: "decimals", blockNumber }) as Promise<number>,
        registered ? Promise.resolve(registered.displaySymbol) : client.readContract({ address: token.address,
          abi: erc20Abi, functionName: "symbol", blockNumber }) as Promise<string>,
      ]);
      const listing = listed.find((asset) => asset.token.toLowerCase() === token.address.toLowerCase());
      return { address: token.address, symbol, decimals, amountAtomic: amount.toString(),
        formatted: formatUnits(amount, decimals), ...(listing ? { priceUsd: listing.priceUsd } : {}) };
    })),
    client.readContract({
      address: USDG_A_TOKEN,
      abi: erc20Abi,
      functionName: "balanceOf",
      args: [address],
      blockNumber,
    }),
    client.readContract({
      address: USDT_A_TOKEN,
      abi: erc20Abi,
      functionName: "balanceOf",
      args: [address],
      blockNumber,
    }),
  ]);
  return {
    address,
    chainId,
    networkName: "X Layer Mainnet",
    blockNumber: blockNumber.toString(),
    observedAt: new Date().toISOString(),
    native: { symbol: "OKB", amountAtomic: native.toString(), formatted: formatUnits(native, 18) },
    balances,
    positions: [
      {
        adapterId: "aave-v3@1",
        symbol: "aUSDG",
        amountAtomic: aUsdG.toString(),
        formatted: formatUnits(aUsdG, 6),
      },
      {
        adapterId: "aave-v3@1",
        symbol: "aUSDt0",
        amountAtomic: aUsdT0.toString(),
        formatted: formatUnits(aUsdT0, 6),
      },
    ],
    analytics,
  };
}
