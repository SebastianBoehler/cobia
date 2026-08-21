"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { getAddress, isAddress, type Address } from "viem";
import type { Eip1193Request, Eip6963ProviderDetail, EvmWalletChainId, XLayerWalletChainId } from "../../lib/wallet/eip1193";
import { parseChainId } from "../../lib/wallet/eip1193";

const CHAINS = {
  1: {
    chainId: "0x1",
    chainName: "Ethereum",
    rpcUrls: ["https://ethereum-rpc.publicnode.com"],
    blockExplorerUrls: ["https://etherscan.io"],
    nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  },
  196: {
    chainId: "0xc4",
    chainName: "X Layer",
    rpcUrls: ["https://rpc.xlayer.tech"],
    blockExplorerUrls: ["https://www.okx.com/web3/explorer/xlayer"],
    nativeCurrency: { name: "OKB", symbol: "OKB", decimals: 18 },
  },
  1952: {
    chainId: "0x7a0",
    chainName: "X Layer Testnet",
    rpcUrls: ["https://testrpc.xlayer.tech/terigon"],
    blockExplorerUrls: ["https://www.oklink.com/x-layer-test"],
    nativeCurrency: { name: "OKB", symbol: "OKB", decimals: 18 },
  },
  8453: {
    chainId: "0x2105",
    chainName: "Base",
    rpcUrls: ["https://mainnet.base.org"],
    blockExplorerUrls: ["https://basescan.org"],
    nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  },
} as const;

const SELECTED_WALLET_KEY = "cobia-selected-wallet-rdns";

interface WalletSession {
  providers: Eip6963ProviderDetail[];
  selected: Eip6963ProviderDetail | null;
  account: Address | null;
  chainId: number | null;
  targetChainId: XLayerWalletChainId;
  networkName: "X Layer Mainnet" | "X Layer Testnet";
  error: string | null;
  connect(uuid: string): Promise<void>;
  disconnect(): void;
  request(input: Eip1193Request): Promise<unknown>;
  switchChain(chainId: EvmWalletChainId): Promise<void>;
  switchToXLayer(): Promise<void>;
}

const missing = async () => { throw new Error("Connect an EVM wallet first."); };
const WalletContext = createContext<WalletSession>({
  providers: [], selected: null, account: null, chainId: null, targetChainId: 196,
  networkName: "X Layer Mainnet", error: null,
  connect: missing, disconnect: () => undefined, request: missing, switchChain: missing, switchToXLayer: missing,
});

function errorMessage(cause: unknown): string {
  return cause instanceof Error ? cause.message : "The wallet request failed.";
}

async function requestChainSwitch(
  provider: Eip6963ProviderDetail["provider"],
  target: EvmWalletChainId,
): Promise<void> {
  const chain = CHAINS[target];
  try {
    await provider.request({ method: "wallet_switchEthereumChain", params: [{ chainId: chain.chainId }] });
  } catch (cause) {
    const code = typeof cause === "object" && cause && "code" in cause ? cause.code : undefined;
    if (code !== 4902) throw cause;
    await provider.request({
      method: "wallet_addEthereumChain",
      params: [{
        ...chain,
      }],
    });
  }
}

export function WalletProvider({ children, targetChainId = 196 }: {
  children: ReactNode;
  targetChainId?: XLayerWalletChainId;
}) {
  const [providers, setProviders] = useState<Eip6963ProviderDetail[]>([]);
  const [selected, setSelected] = useState<Eip6963ProviderDetail | null>(null);
  const [account, setAccount] = useState<Address | null>(null);
  const [chainId, setChainId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const restoringWallet = useRef<string | null>(null);

  useEffect(() => {
    const announce = (event: Event) => {
      const detail = (event as CustomEvent<Eip6963ProviderDetail>).detail;
      if (!detail?.info?.uuid || !detail.provider) return;
      setProviders((current) => current.some((item) => item.info.uuid === detail.info.uuid)
        ? current
        : [...current, detail].sort((a, b) => a.info.name.localeCompare(b.info.name)));
    };
    window.addEventListener("eip6963:announceProvider", announce);
    window.dispatchEvent(new Event("eip6963:requestProvider"));
    return () => window.removeEventListener("eip6963:announceProvider", announce);
  }, []);

  useEffect(() => {
    if (selected) return;
    const rdns = window.localStorage.getItem(SELECTED_WALLET_KEY);
    if (!rdns || restoringWallet.current === rdns) return;
    const detail = providers.find((item) => item.info.rdns === rdns);
    if (!detail) return;
    restoringWallet.current = rdns;
    let cancelled = false;
    void Promise.all([
      detail.provider.request({ method: "eth_accounts" }),
      detail.provider.request({ method: "eth_chainId" }),
    ]).then(([accounts, currentChain]) => {
      if (cancelled) return;
      if (!Array.isArray(accounts) || !isAddress(accounts[0])) {
        window.localStorage.removeItem(SELECTED_WALLET_KEY);
        return;
      }
      setSelected(detail);
      setAccount(getAddress(accounts[0]));
      setChainId(parseChainId(currentChain));
    }).catch(() => {
      if (!cancelled) window.localStorage.removeItem(SELECTED_WALLET_KEY);
    });
    return () => { cancelled = true; };
  }, [providers, selected]);

  useEffect(() => {
    if (!selected?.provider.on) return;
    const accountsChanged = (value: unknown) => {
      const next = Array.isArray(value) && isAddress(value[0]) ? getAddress(value[0]) : null;
      setAccount(next);
    };
    const chainChanged = (value: unknown) => setChainId(parseChainId(value));
    selected.provider.on("accountsChanged", accountsChanged);
    selected.provider.on("chainChanged", chainChanged);
    return () => {
      selected.provider.removeListener?.("accountsChanged", accountsChanged);
      selected.provider.removeListener?.("chainChanged", chainChanged);
    };
  }, [selected]);

  const connect = useCallback(async (uuid: string) => {
    const detail = providers.find((item) => item.info.uuid === uuid);
    if (!detail) throw new Error("The selected wallet is no longer available.");
    setError(null);
    try {
      const accounts = await detail.provider.request({ method: "eth_requestAccounts" });
      if (!Array.isArray(accounts) || !isAddress(accounts[0])) {
        throw new Error("The wallet returned no valid EVM account.");
      }
      const currentChain = await detail.provider.request({ method: "eth_chainId" });
      const parsedChain = parseChainId(currentChain);
      if (parsedChain !== targetChainId) await requestChainSwitch(detail.provider, targetChainId);
      window.localStorage.setItem(SELECTED_WALLET_KEY, detail.info.rdns);
      setSelected(detail);
      setAccount(getAddress(accounts[0]));
      setChainId(targetChainId);
    } catch (cause) {
      const message = errorMessage(cause);
      setError(message);
      throw new Error(message, { cause });
    }
  }, [providers, targetChainId]);

  const disconnect = useCallback(() => {
    window.localStorage.removeItem(SELECTED_WALLET_KEY);
    restoringWallet.current = null;
    setSelected(null);
    setAccount(null);
    setChainId(null);
    setError(null);
  }, []);

  const request = useCallback(async (input: Eip1193Request) => {
    if (!selected) throw new Error("Connect an EVM wallet first.");
    return selected.provider.request(input);
  }, [selected]);

  const switchChain = useCallback(async (target: EvmWalletChainId) => {
    if (!selected) throw new Error("Connect an EVM wallet first.");
    if (chainId === target) return;
    await requestChainSwitch(selected.provider, target);
    setChainId(target);
  }, [chainId, selected]);

  const switchToXLayer = useCallback(() => switchChain(targetChainId), [switchChain, targetChainId]);
  const networkName: WalletSession["networkName"] = targetChainId === 1952
    ? "X Layer Testnet"
    : "X Layer Mainnet";

  const value = useMemo(() => ({
    providers, selected, account, chainId, targetChainId, networkName, error,
    connect, disconnect, request, switchChain, switchToXLayer,
  }), [providers, selected, account, chainId, targetChainId, networkName, error,
    connect, disconnect, request, switchChain, switchToXLayer]);

  return <WalletContext value={value}>{children}</WalletContext>;
}

export function useWallet(): WalletSession {
  return useContext(WalletContext);
}
