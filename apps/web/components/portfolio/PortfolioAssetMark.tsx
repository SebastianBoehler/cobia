import { TokenAssetMark } from "../brand/TokenAssetMark";

export function PortfolioAssetMark({ symbol, size = 46 }: { symbol: string; size?: number }) {
  return <TokenAssetMark size={size} symbol={symbol} />;
}
