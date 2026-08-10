"use client";

import { ChevronDown, Wallet } from "lucide-react";
import { useState } from "react";
import { shortAddress } from "../../lib/wallet/eip1193";
import { useWallet } from "./WalletProvider";

export function WalletButton() {
  const wallet = useWallet();
  const [open, setOpen] = useState(false);
  const [localError, setLocalError] = useState<string>();

  async function choose(uuid: string): Promise<void> {
    setLocalError(undefined);
    try {
      await wallet.connect(uuid);
      setOpen(false);
    } catch (cause) {
      setLocalError(cause instanceof Error ? cause.message : "Wallet connection failed.");
    }
  }

  function toggle(): void {
    setLocalError(undefined);
    if (wallet.account) {
      setOpen((value) => !value);
      return;
    }
    if (wallet.providers.length === 1) {
      void choose(wallet.providers[0].info.uuid);
      return;
    }
    if (wallet.providers.length === 0) {
      setLocalError("No installed EVM wallet was detected.");
      return;
    }
    setOpen((value) => !value);
  }

  return (
    <div className="wallet-control">
      <button className="button button--quiet app-header__action" type="button" onClick={toggle} aria-expanded={open}>
        <Wallet aria-hidden="true" size={16} />
        {wallet.account && wallet.selected
          ? `${wallet.selected.info.name} · ${shortAddress(wallet.account)}`
          : "Connect wallet"}
        <ChevronDown aria-hidden="true" size={14} />
      </button>
      {open ? (
        <div className="wallet-menu" role="dialog" aria-label="Choose wallet">
          {wallet.account ? (
            <button type="button" onClick={() => { wallet.disconnect(); setOpen(false); }}>Disconnect</button>
          ) : wallet.providers.map((detail) => (
            <button key={detail.info.uuid} type="button" onClick={() => void choose(detail.info.uuid)}>
              {detail.info.name}
            </button>
          ))}
        </div>
      ) : null}
      {localError ?? wallet.error ? <p className="wallet-error" role="alert">{localError ?? wallet.error}</p> : null}
    </div>
  );
}
