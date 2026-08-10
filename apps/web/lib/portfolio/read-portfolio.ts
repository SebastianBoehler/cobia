import { createPublicClient, erc20Abi, formatUnits, getAddress, http, type Address } from "viem";
import { SUPPORTED_ASSETS } from "../chain/supported-assets";
import { USDG_A_TOKEN, xLayer, xLayerTestnet } from "../chain/xlayer";

export type PortfolioChainId = 196 | 1952;

export interface PortfolioSnapshot {
  address: Address;
  chainId: PortfolioChainId;
  networkName: "X Layer Mainnet" | "X Layer Testnet";
  blockNumber: string;
  observedAt: string;
  native: { symbol: "OKB"; amountAtomic: string; formatted: string };
  balances: Array<{ address: Address; symbol: string; amountAtomic: string; formatted: string }>;
  positions: Array<{ adapterId: "aave-v3@1"; symbol: "aUSDG"; amountAtomic: string; formatted: string }>;
}

export async function readPortfolio(
  address: Address,
  chainId: PortfolioChainId = 196,
  rpcUrl?: string,
): Promise<PortfolioSnapshot> {
  const chain = chainId === 1952 ? xLayerTestnet : xLayer;
  const endpoint = rpcUrl ?? (chainId === 1952
    ? process.env.XLAYER_TESTNET_RPC_URL
    : process.env.XLAYER_RPC_URL) ?? chain.rpcUrls.default.http[0];
  const client = createPublicClient({ chain, transport: http(endpoint, { timeout: 10_000 }) });
  const blockNumber = await client.getBlockNumber();
  const native = await client.getBalance({ address, blockNumber });
  if (chainId === 1952) {
    const paymentAsset = getAddress(process.env.PAYMENT_ASSET ?? "0x9e29b3aada05bf2d2c827af80bd28dc0b9b4fb0c");
    const amount = await client.readContract({
      address: paymentAsset,
      abi: erc20Abi,
      functionName: "balanceOf",
      args: [address],
      blockNumber,
    });
    return {
      address,
      chainId,
      networkName: "X Layer Testnet",
      blockNumber: blockNumber.toString(),
      observedAt: new Date().toISOString(),
      native: { symbol: "OKB", amountAtomic: native.toString(), formatted: formatUnits(native, 18) },
      balances: [{
        address: paymentAsset,
        symbol: "USDt0 test",
        amountAtomic: amount.toString(),
        formatted: formatUnits(amount, 6),
      }],
      positions: [],
    };
  }

  const [balances, aUsdG] = await Promise.all([
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
    positions: [{
      adapterId: "aave-v3@1",
      symbol: "aUSDG",
      amountAtomic: aUsdG.toString(),
      formatted: formatUnits(aUsdG, 6),
    }],
  };
}
