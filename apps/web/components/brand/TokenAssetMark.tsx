"use client";

import { TokenPAXG, TokenUSDT } from "@web3icons/react";
import Image from "next/image";
import { useState, type CSSProperties } from "react";
import { AssetMark } from "./AssetMark";
import { ProtocolMark } from "./ProtocolMark";

function canonicalXStockSymbol(symbol: string): string | undefined {
  const trimmed = symbol.trim();
  if (!/^[A-Za-z0-9.]{1,15}x$/.test(trimmed)) return undefined;
  return `${trimmed.slice(0, -1).toUpperCase()}x`;
}

function XStockTokenMark({ symbol, size }: { symbol: string; size: number }) {
  const [failed, setFailed] = useState(false);
  const src = `https://xstocks-metadata.backed.fi/logos/tokens/${encodeURIComponent(symbol)}.png`;
  return <span aria-label={`${symbol} token`} className="brand-mark brand-mark--xstock"
    role="img" style={{ "--brand-mark-size": `${size}px` } as CSSProperties}>
    <span aria-hidden="true">{symbol.slice(0, 1)}</span>
    {!failed ? <Image alt="" aria-hidden="true" height={size} onError={() => setFailed(true)}
      src={src} unoptimized width={size} /> : null}
  </span>;
}

export function TokenAssetMark({ symbol, size = 46 }: { symbol: string; size?: number }) {
  const normalized = symbol.trim().toUpperCase();
  if (normalized === "OKB") return <AssetMark asset="OKB" size={size} />;
  if (normalized === "USDG") return <AssetMark asset="USDG" size={size} />;
  if (normalized === "USDT0") return <AssetMark asset="USDt0" size={size} />;
  const xStock = canonicalXStockSymbol(symbol);
  if (xStock) return <XStockTokenMark size={size} symbol={xStock} />;
  if (normalized.startsWith("AUSD")) return <ProtocolMark protocol="Aave V3" size={size} />;
  return <span aria-label={`${symbol} token`} className="brand-mark" role="img"
    style={{ "--brand-mark-size": `${size}px` } as CSSProperties}>
    {normalized === "USDT" ? <TokenUSDT aria-hidden="true" size="100%" variant="background" /> : null}
    {normalized === "PAXG" ? <TokenPAXG aria-hidden="true" size="100%" variant="background" /> : null}
    {normalized !== "USDT" && normalized !== "PAXG"
      ? <span aria-hidden="true">{normalized.slice(0, 1)}</span> : null}
  </span>;
}
