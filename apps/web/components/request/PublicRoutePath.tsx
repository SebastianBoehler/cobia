import type { AssetValuationV2 } from "@cobia/domain";
import { ArrowRight } from "lucide-react";
import type { PublicRouteSummaryV2 } from "../../lib/markets/route-summary";
import { AssetMark } from "../brand/AssetMark";
import { ProtocolMark } from "../brand/ProtocolMark";
import { assetDisplay, formattedAssetAmount } from "../routes/purchased-route-format";
import styles from "./CompetitionView.module.css";

export function PublicRoutePath({
  summary,
  valuations,
}: {
  summary: PublicRouteSummaryV2;
  valuations: readonly AssetValuationV2[];
}) {
  const input = assetDisplay(summary.inputAsset, valuations);
  return (
    <div className={styles.routePath} aria-label="Verified route path">
      <div className={styles.routeNode}>
        <AssetMark asset={input.symbol === "USDt0" ? "USDt0" : "USDG"} size={38} />
        <span><strong>{input.symbol}</strong><small>You commit</small></span>
      </div>
      {summary.steps.map((step, index) => {
        const label = step.kind === "supply"
          ? `Supply ${formattedAssetAmount(step.inputAtomic, step.asset, valuations)}`
          : step.kind === "swap"
            ? `Swap to ${assetDisplay(step.tokenOut, valuations).symbol}`
            : "Mint full-range LP";
        return (
          <div className={styles.routeSegment} key={`${step.kind}-${index}`}>
            <ArrowRight aria-hidden="true" size={18} />
            <div className={styles.routeNode}>
              <ProtocolMark protocol={step.protocol} size={38} />
              <span><strong>{step.protocol}</strong><small>{label}</small></span>
            </div>
          </div>
        );
      })}
      {BigInt(summary.retainedAtomic) > 0n ? (
        <span className={styles.retained}>
          {formattedAssetAmount(summary.retainedAtomic, summary.inputAsset, valuations)} stays in wallet
        </span>
      ) : null}
    </div>
  );
}
