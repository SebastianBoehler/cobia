import { PortfolioAssetMark } from "../portfolio/PortfolioAssetMark";
import { useRef } from "react";

const VISIBLE_ASSET_LIMIT = 4;

export interface AvailableIntentAsset {
  symbol: string;
  amount: string;
  priceUsd?: string;
}

type PortfolioState = "idle" | "loading" | "ready" | "error";

function formatAmount(value: string): string {
  return Number(value).toLocaleString("en-US", { maximumFractionDigits: 6 });
}

function estimateUsd(asset: AvailableIntentAsset): string | undefined {
  const amount = Number(asset.amount);
  const price = Number(asset.priceUsd);
  if (!Number.isFinite(amount) || !Number.isFinite(price) || amount < 0 || price < 0) return undefined;
  return `$${(amount * price).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: amount * price >= 1 ? 2 : 4,
  })}`;
}

function AssetShortcut({ asset, onBeforeSelect, onSelect }: {
  asset: AvailableIntentAsset;
  onSelect(asset: AvailableIntentAsset): void;
  onBeforeSelect?(): void;
}) {
  const estimated = estimateUsd(asset);
  const amount = formatAmount(asset.amount);

  return <button aria-label={`Add @${asset.symbol} to goal — ${amount} ${asset.symbol} available${estimated ? `, estimated ${estimated}` : ""}`}
    onClick={() => { onBeforeSelect?.(); onSelect(asset); }} type="button">
    <span aria-hidden="true" className="intent-availability__asset-mark">
      <PortfolioAssetMark size={18} symbol={asset.symbol} />
    </span>
    <span className="intent-availability__asset-name">{asset.symbol}</span>
    <span className="intent-availability__asset-value">{estimated ?? amount}</span>
  </button>;
}

export function IntentAvailableAssets({ assets, state, onSelect }: {
  assets: readonly AvailableIntentAsset[];
  state: PortfolioState;
  onSelect(asset: AvailableIntentAsset): void;
}) {
  const overflowRef = useRef<HTMLDetailsElement>(null);
  if (state === "idle") return null;
  const visibleAssets = assets.slice(0, VISIBLE_ASSET_LIMIT);
  const hiddenAssets = assets.slice(VISIBLE_ASSET_LIMIT);

  return <section aria-label="Available wallet assets" className="intent-availability">
    {state === "loading" ? <p className="intent-availability__status" role="status">Reading wallet balances…</p> : null}
    {state === "error" ? <p className="intent-availability__status">Wallet balances are unavailable right now.</p> : null}
    {state === "ready" && assets.length === 0
      ? <p className="intent-availability__status">No supported assets are available in this wallet.</p> : null}
    {state === "ready" && assets.length > 0 ? <ul aria-label="Wallet balance shortcuts">
      {visibleAssets.map((asset) => <li key={asset.symbol}>
        <AssetShortcut asset={asset} onSelect={onSelect} />
      </li>)}
      {hiddenAssets.length ? <li className="intent-availability__overflow">
        <details ref={overflowRef}>
          <summary aria-label={`Show ${hiddenAssets.length} more wallet assets`}>{hiddenAssets.length} more</summary>
          <ul aria-label="More wallet balance shortcuts">
            {hiddenAssets.map((asset) => <li key={asset.symbol}>
              <AssetShortcut asset={asset} onBeforeSelect={() => overflowRef.current?.removeAttribute("open")}
                onSelect={onSelect} />
            </li>)}
          </ul>
        </details>
      </li> : null}
    </ul> : null}
  </section>;
}
