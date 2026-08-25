import {
  Exchange1inch,
  ExchangeBalancer,
  ExchangeCowswap,
  ExchangeHyperliquid,
  ExchangeOdos,
  ExchangeOkx,
  ExchangePancakeSwap,
  ExchangeParaSwap,
  ExchangeSushiswap,
  ExchangeUniswap,
  TokenAAVE,
  TokenCOMP,
  TokenCRV,
  TokenDYDX,
  TokenFRAX,
  TokenGMX,
  TokenJOE,
  TokenJUP,
  TokenLDO,
  TokenMKR,
  TokenPENDLE,
  TokenQUICK,
  TokenRAY,
  TokenSTG,
  TokenUSDE,
  TokenYFI,
} from "@web3icons/react";
import type { CSSProperties } from "react";

const protocolMarks = [
  { kind: "aave", names: ["aave"], Mark: TokenAAVE },
  { kind: "balancer", names: ["balancer"], Mark: ExchangeBalancer },
  { kind: "compound", names: ["compound"], Mark: TokenCOMP },
  { kind: "curve", names: ["curve"], Mark: TokenCRV },
  { kind: "cowswap", names: ["cowswap", "cow swap"], Mark: ExchangeCowswap },
  { kind: "dydx", names: ["dydx"], Mark: TokenDYDX },
  { kind: "ethena", names: ["ethena"], Mark: TokenUSDE },
  { kind: "frax", names: ["frax"], Mark: TokenFRAX },
  { kind: "gmx", names: ["gmx"], Mark: TokenGMX },
  { kind: "hyperliquid", names: ["hyperliquid"], Mark: ExchangeHyperliquid },
  { kind: "jupiter", names: ["jupiter"], Mark: TokenJUP },
  { kind: "lido", names: ["lido"], Mark: TokenLDO },
  { kind: "maker", names: ["maker"], Mark: TokenMKR },
  { kind: "odos", names: ["odos"], Mark: ExchangeOdos },
  { kind: "okx", names: ["okx"], Mark: ExchangeOkx },
  { kind: "pancakeswap", names: ["pancakeswap", "pancake swap"], Mark: ExchangePancakeSwap },
  { kind: "paraswap", names: ["paraswap", "para swap"], Mark: ExchangeParaSwap },
  { kind: "pendle", names: ["pendle"], Mark: TokenPENDLE },
  { kind: "quickswap", names: ["quickswap", "quick swap"], Mark: TokenQUICK },
  { kind: "raydium", names: ["raydium"], Mark: TokenRAY },
  { kind: "stargate", names: ["stargate"], Mark: TokenSTG },
  { kind: "sushiswap", names: ["sushiswap", "sushi swap"], Mark: ExchangeSushiswap },
  { kind: "traderjoe", names: ["trader joe", "traderjoe"], Mark: TokenJOE },
  { kind: "uniswap", names: ["uniswap"], Mark: ExchangeUniswap },
  { kind: "yearn", names: ["yearn"], Mark: TokenYFI },
  { kind: "oneinch", names: ["1inch", "oneinch", "one inch"], Mark: Exchange1inch },
] as const;

function identity(protocol: string) {
  const value = protocol.toLowerCase();
  return protocolMarks.find(({ names }) => names.some((name) => value.includes(name)));
}

export function ProtocolMark({ protocol, size = 40, decorative = false }: {
  protocol: string;
  size?: number;
  decorative?: boolean;
}) {
  const match = identity(protocol);
  const Mark = match?.Mark;
  return (
    <span
      aria-hidden={decorative || undefined}
      aria-label={decorative ? undefined : protocol}
      className={`brand-mark brand-mark--protocol brand-mark--${match?.kind ?? "other"}`}
      role={decorative ? undefined : "img"}
      style={{ "--brand-mark-size": `${size}px` } as CSSProperties}
    >
      {Mark ? <Mark aria-hidden="true" size="100%" variant="background" /> : <span aria-hidden="true">{protocol.trim().slice(0, 1).toUpperCase()}</span>}
    </span>
  );
}
