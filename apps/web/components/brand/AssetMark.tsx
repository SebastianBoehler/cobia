import { TokenUSDT } from "@web3icons/react";
import Image from "next/image";
import type { CSSProperties } from "react";
import { USDG_TOKEN_LOGO_DATA_URL } from "./official-token-art";

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
        : <Image alt="" aria-hidden="true" height={size} src={USDG_TOKEN_LOGO_DATA_URL}
          unoptimized width={size} />}
    </span>
  );
}
