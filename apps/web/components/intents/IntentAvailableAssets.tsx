import { PortfolioAssetMark } from "../portfolio/PortfolioAssetMark";

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

export function IntentAvailableAssets({ assets, state, onSelect }: {
  assets: readonly AvailableIntentAsset[];
  state: PortfolioState;
  onSelect(asset: AvailableIntentAsset): void;
}) {
  if (state === "idle") return null;

  return <section aria-label="Available wallet assets" className="intent-availability">
    {state === "loading" ? <p className="intent-availability__status" role="status">Reading wallet balances…</p> : null}
    {state === "error" ? <p className="intent-availability__status">Wallet balances are unavailable right now.</p> : null}
    {state === "ready" && assets.length === 0
      ? <p className="intent-availability__status">No supported assets are available in this wallet.</p> : null}
    {state === "ready" && assets.length > 0 ? <ul aria-label="Wallet balance shortcuts">
      {assets.map((asset) => {
        const estimated = estimateUsd(asset);
        const amount = formatAmount(asset.amount);
        return <li key={asset.symbol}>
          <button aria-label={`Add @${asset.symbol} to goal — ${amount} ${asset.symbol} available${estimated ? `, estimated ${estimated}` : ""}`}
            onClick={() => onSelect(asset)} type="button">
            <span aria-hidden="true" className="intent-availability__asset-mark">
              <PortfolioAssetMark size={18} symbol={asset.symbol} />
            </span>
            <span className="intent-availability__asset-name">{asset.symbol}</span>
            <span className="intent-availability__asset-value">{estimated ?? amount}</span>
          </button>
        </li>;
      })}
    </ul> : null}
  </section>;
}
