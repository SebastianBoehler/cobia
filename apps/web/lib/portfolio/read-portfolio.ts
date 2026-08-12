import { createPublicClient, erc20Abi, formatUnits, http, type Address } from "viem";
import { SUPPORTED_ASSETS } from "../chain/supported-assets";
import { USDT_A_TOKEN, USDG_A_TOKEN, xLayer } from "../chain/xlayer";

export type PortfolioChainId = 196;

export interface PortfolioSnapshot {
  address: Address;
  chainId: PortfolioChainId;
  networkName: "X Layer Mainnet";
  blockNumber: string;
  observedAt: string;
  native: { symbol: "OKB"; amountAtomic: string; formatted: string };
  balances: Array<{ address: Address; symbol: string; amountAtomic: string; formatted: string }>;
  positions: Array<{
    adapterId: "aave-v3@1";
    symbol: "aUSDG" | "aUSDt0";
    amountAtomic: string;
    formatted: string;
  }>;
}

export async function readPortfolio(
  address: Address,
  chainId: PortfolioChainId = 196,
  rpcUrl?: string,
): Promise<PortfolioSnapshot> {
  const endpoint = rpcUrl ?? process.env.XLAYER_RPC_URL ?? xLayer.rpcUrls.default.http[0];
  const client = createPublicClient({ chain: xLayer, transport: http(endpoint, { timeout: 10_000 }) });
  const blockNumber = await client.getBlockNumber();
  const native = await client.getBalance({ address, blockNumber });
  const [balances, aUsdG, aUsdT0] = await Promise.all([
    Promise.all(SUPPORTED_ASSETS.map(async (asset) => ({
      asset,
      amount: await client.readContract({
        address: asset.address,
        abi: erc20Abi,
        functionName: "balanceOf",
        args: [address],
        blockNumber,
      }),
    }))),
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
    balances: balances.map(({ asset, amount }) => ({
      address: asset.address,
      symbol: asset.displaySymbol,
      amountAtomic: amount.toString(),
      formatted: formatUnits(amount, asset.decimals),
    })),
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
  };
}
