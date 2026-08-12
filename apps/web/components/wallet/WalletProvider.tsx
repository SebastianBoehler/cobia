"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { getAddress, isAddress, type Address } from "viem";
import type { Eip1193Request, Eip6963ProviderDetail, XLayerChainId } from "../../lib/wallet/eip1193";
import { parseChainId } from "../../lib/wallet/eip1193";

const CHAINS = {
  196: {
    chainId: "0xc4",
    chainName: "X Layer",
    rpcUrls: ["https://rpc.xlayer.tech"],
    blockExplorerUrls: ["https://www.okx.com/web3/explorer/xlayer"],
  },
} as const;

interface WalletSession {
  providers: Eip6963ProviderDetail[];
  selected: Eip6963ProviderDetail | null;
  account: Address | null;
  chainId: number | null;
  error: string | null;
  connect(uuid: string): Promise<void>;
  disconnect(): void;
  request(input: Eip1193Request): Promise<unknown>;
  switchChain(chainId: XLayerChainId): Promise<void>;
  switchToXLayer(): Promise<void>;
}

const missing = async () => { throw new Error("Connect an EVM wallet first."); };
const WalletContext = createContext<WalletSession>({
  providers: [], selected: null, account: null, chainId: null, error: null,
  connect: missing, disconnect: () => undefined, request: missing, switchChain: missing, switchToXLayer: missing,
});

function errorMessage(cause: unknown): string {
  return cause instanceof Error ? cause.message : "The wallet request failed.";
}

export function WalletProvider({ children }: { children: ReactNode }) {
  const [providers, setProviders] = useState<Eip6963ProviderDetail[]>([]);
  const [selected, setSelected] = useState<Eip6963ProviderDetail | null>(null);
  const [account, setAccount] = useState<Address | null>(null);
  const [chainId, setChainId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

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
      setSelected(detail);
      setAccount(getAddress(accounts[0]));
      setChainId(parseChainId(currentChain));
    } catch (cause) {
      const message = errorMessage(cause);
      setError(message);
      throw new Error(message, { cause });
    }
  }, [providers]);

  const disconnect = useCallback(() => {
    setSelected(null);
    setAccount(null);
    setChainId(null);
    setError(null);
  }, []);

  const request = useCallback(async (input: Eip1193Request) => {
    if (!selected) throw new Error("Connect an EVM wallet first.");
    return selected.provider.request(input);
  }, [selected]);

  const switchChain = useCallback(async (target: XLayerChainId) => {
    if (!selected) throw new Error("Connect an EVM wallet first.");
    if (chainId === target) return;
    const chain = CHAINS[target];
    try {
      await selected.provider.request({ method: "wallet_switchEthereumChain", params: [{ chainId: chain.chainId }] });
      setChainId(target);
    } catch (cause) {
      const code = typeof cause === "object" && cause && "code" in cause ? cause.code : undefined;
      if (code !== 4902) throw cause;
      await selected.provider.request({
        method: "wallet_addEthereumChain",
        params: [{
          ...chain,
          nativeCurrency: { name: "OKB", symbol: "OKB", decimals: 18 },
        }],
      });
      setChainId(target);
    }
  }, [chainId, selected]);

  const switchToXLayer = useCallback(() => switchChain(196), [switchChain]);

  const value = useMemo(() => ({
    providers, selected, account, chainId, error, connect, disconnect, request, switchChain, switchToXLayer,
  }), [providers, selected, account, chainId, error, connect, disconnect, request, switchChain, switchToXLayer]);

  return <WalletContext value={value}>{children}</WalletContext>;
}

export function useWallet(): WalletSession {
  return useContext(WalletContext);
}
