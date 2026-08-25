import { TokenOKB, TokenUSDT } from "@web3icons/react";
import type { CSSProperties } from "react";
import { AssetMark } from "../brand/AssetMark";
import { ProtocolMark } from "../brand/ProtocolMark";

export function PortfolioAssetMark({ symbol, size = 46 }: { symbol: string; size?: number }) {
  const normalized = symbol.toUpperCase();
  if (normalized === "USDG") return <AssetMark asset="USDG" size={size} />;
  if (normalized === "USDT0") return <AssetMark asset="USDt0" size={size} />;
  if (normalized.startsWith("AUSD")) return <ProtocolMark protocol="Aave V3" size={size} />;
  return (
    <span
      aria-label={`${symbol} token`}
      className="brand-mark"
      role="img"
      style={{ "--brand-mark-size": `${size}px` } as CSSProperties}
    >
      {normalized === "OKB" ? <TokenOKB aria-hidden="true" size="100%" variant="mono" /> : null}
      {normalized === "USDT" ? <TokenUSDT aria-hidden="true" size="100%" variant="background" /> : null}
      {normalized !== "OKB" && normalized !== "USDT"
        ? <span aria-hidden="true">{normalized.slice(0, 1)}</span> : null}
    </span>
  );
}
