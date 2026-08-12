import { TokenUSDT } from "@web3icons/react";
import type { CSSProperties } from "react";

export type AssetIdentity = "USDG" | "USDt0";

export function AssetMark({ asset, size = 40 }: { asset: AssetIdentity; size?: number }) {
  return (
    <span
      aria-label={`${asset} token`}
      className={`brand-mark brand-mark--asset brand-mark--${asset.toLowerCase()}`}
      role="img"
      style={{ "--brand-mark-size": `${size}px` } as CSSProperties}
    >
      {asset === "USDt0"
        ? <TokenUSDT aria-hidden="true" size="100%" variant="background" />
        : <span aria-hidden="true">$</span>}
    </span>
  );
}
