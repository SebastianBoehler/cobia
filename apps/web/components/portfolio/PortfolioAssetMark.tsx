import { TokenOKB } from "@web3icons/react";
import type { CSSProperties } from "react";
import { AssetMark, type AssetIdentity } from "../brand/AssetMark";
import { ProtocolMark } from "../brand/ProtocolMark";

export function PortfolioAssetMark({ symbol, size = 46 }: { symbol: string; size?: number }) {
  if (symbol === "USDG" || symbol === "USDt0") {
    return <AssetMark asset={symbol as AssetIdentity} size={size} />;
  }
  if (symbol.startsWith("aUSD")) return <ProtocolMark protocol="Aave V3" size={size} />;
  return (
    <span
      aria-label={`${symbol} token`}
      className="brand-mark"
      role="img"
      style={{ "--brand-mark-size": `${size}px` } as CSSProperties}
    >
      <TokenOKB aria-hidden="true" size="100%" variant="background" />
    </span>
  );
}
