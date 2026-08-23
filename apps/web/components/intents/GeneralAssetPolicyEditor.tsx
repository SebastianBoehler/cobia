import type { Address } from "viem";
import type { GeneralAssetDraftV1 } from "../../lib/intents/general-asset-draft";

function chainName(chainId: 1 | 196): string {
  return chainId === 1 ? "Ethereum" : "X Layer";
}

export function GeneralAssetPolicyEditor({ values, owner, onChange }: {
  values: GeneralAssetDraftV1;
  owner: Address | null;
  onChange(values: GeneralAssetDraftV1): void;
}) {
  const setInput = (field: "maximumAtomic" | "maximumUsdE8", value: string) =>
    onChange({ ...values, input: { ...values.input, [field]: value } });
  const setLimit = (field: "maxConversionLossBps" | "maxSlippageBps", value: string) =>
    onChange({ ...values, limits: { ...values.limits, [field]: Number(value) } });

  return <section aria-labelledby="general-asset-policy-title" className="policy-editor">
    <header><div>
      <h2 id="general-asset-policy-title">Review exact asset authority</h2>
      <p>Chain and contract identify each asset. Symbols are display metadata only.</p>
    </div></header>
    <div className="policy-fields">
      <label>Maximum input atomic
        <input inputMode="numeric" value={values.input.maximumAtomic}
          onChange={(event) => setInput("maximumAtomic", event.target.value)} />
      </label>
      <label>Maximum input USD-E8
        <input aria-label="Maximum input USD-E8" inputMode="numeric" value={values.input.maximumUsdE8}
          onChange={(event) => setInput("maximumUsdE8", event.target.value)} />
        <small>Cannot exceed $1,000.00 for one route.</small>
      </label>
      <label>Minimum output atomic
        <input inputMode="numeric" value={values.output.minimumAtomic}
          onChange={(event) => onChange({ ...values, output: {
            ...values.output, minimumAtomic: event.target.value,
          } })} />
      </label>
      <label>Maximum conversion loss (bps)
        <input inputMode="numeric" max="10000" min="0" value={values.limits.maxConversionLossBps}
          onChange={(event) => setLimit("maxConversionLossBps", event.target.value)} />
      </label>
      <label>Maximum slippage (bps)
        <input inputMode="numeric" max="10000" min="0" value={values.limits.maxSlippageBps}
          onChange={(event) => setLimit("maxSlippageBps", event.target.value)} />
      </label>
    </div>

    <dl className="policy-summary">
      <div><dt>Owner</dt><dd>{owner ?? "Connect wallet"}</dd></div>
      <div><dt>Route</dt><dd>{chainName(values.sourceChainId)} → {chainName(values.destinationChainId)}</dd></div>
      <div><dt>Input</dt><dd>{values.input.symbol}<br /><code>{values.input.token}</code></dd></div>
      <div><dt>Output</dt><dd>{values.output.symbol}<br /><code>{values.output.token}</code></dd></div>
      <div><dt>Adapters</dt><dd>{values.allowedAdapters
        .map(({ id, version }) => `${id}@${version}`).join(" → ")}</dd></div>
      <div><dt>Rolling caps</dt><dd>$1,000 route · $5,000 wallet / 24h · $50,000 protocol / 24h</dd></div>
      <div><dt>Expiry</dt><dd>5 minute competition · 30 minute execution window</dd></div>
    </dl>
    <details className="composition-authority">
      <summary>Verifier commitments</summary>
      <div className="composition-authority__body">
        <p>Execution remains unavailable if identity, valuation, code, or behavior evidence drifts.</p>
        <code>{values.input.identityHash}</code><br />
        <code>{values.input.valuationHash}</code><br />
        <code>{values.output.identityHash}</code>
      </div>
    </details>
    <p className="policy-signing-note">Signing publishes bounds only. Every chain transaction remains a separate wallet confirmation.</p>
  </section>;
}
