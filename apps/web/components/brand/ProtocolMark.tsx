import { ExchangeOkx, ExchangeUniswap, TokenAAVE, TokenCRV, TokenPENDLE } from "@web3icons/react";
import type { CSSProperties } from "react";

function identity(protocol: string): "aave" | "curve" | "okx" | "uniswap" | "pendle" | "other" {
  const value = protocol.toLowerCase();
  if (value.includes("aave")) return "aave";
  if (value.includes("curve")) return "curve";
  if (value.includes("okx")) return "okx";
  if (value.includes("uniswap")) return "uniswap";
  if (value.includes("pendle")) return "pendle";
  return "other";
}

export function ProtocolMark({ protocol, size = 40 }: { protocol: string; size?: number }) {
  const kind = identity(protocol);
  return (
    <span
      aria-label={protocol}
      className={`brand-mark brand-mark--protocol brand-mark--${kind}`}
      role="img"
      style={{ "--brand-mark-size": `${size}px` } as CSSProperties}
    >
      {kind === "aave" ? <TokenAAVE aria-hidden="true" size="100%" variant="background" /> : null}
      {kind === "curve" ? <TokenCRV aria-hidden="true" size="100%" variant="background" /> : null}
      {kind === "okx" ? <ExchangeOkx aria-hidden="true" size="100%" variant="background" /> : null}
      {kind === "uniswap" ? <ExchangeUniswap aria-hidden="true" size="100%" variant="background" /> : null}
      {kind === "pendle" ? <TokenPENDLE aria-hidden="true" size="100%" variant="background" /> : null}
      {kind === "other" ? <span aria-hidden="true">{protocol.trim().slice(0, 1).toUpperCase()}</span> : null}
    </span>
  );
}
