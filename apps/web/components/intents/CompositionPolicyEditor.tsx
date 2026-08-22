import type { Address } from "viem";
import { INTENT_ASSETS } from "../../lib/intents/capability-templates";
import type { ComposedIntentDraft } from "../../lib/intents/composition-draft";

const CAPABILITY_LABELS: Record<ComposedIntentDraft["capabilityIds"][number], string> = {
  "aave-v3.supply": "Aave V3 supply",
  "curve-stableswap-ng.exact-input": "Curve StableSwap NG exact input",
  "uniswap-v3.exact-input": "Uniswap V3 exact input",
};

function percentageToBps(value: string) {
  const percentage = Number(value);
  return Number.isFinite(percentage) ? Math.round(percentage * 100) : 0;
}

export function CompositionPolicyEditor({ values, owner, onChange }: {
  values: ComposedIntentDraft;
  owner: Address | null;
  onChange(values: ComposedIntentDraft): void;
}) {
  const input = INTENT_ASSETS.find(({ address }) => address === values.inputToken)
    ?? INTENT_ASSETS[0]!;
  const set = <K extends keyof ComposedIntentDraft>(key: K, value: ComposedIntentDraft[K]) =>
    onChange({ ...values, [key]: value });

  return (
    <section className="policy-editor composition-editor" aria-labelledby="composition-policy-title">
      <header><div><h2 id="composition-policy-title">Registered composition</h2>
        <p>Solvers may combine only these registered actions. The verifier checks the full program.</p>
      </div></header>
      <div className="composition-capabilities" aria-label="Allowed registered actions">
        {values.capabilityIds.map((id, index) => <div key={id}>
          <span>{index + 1}</span><strong>{CAPABILITY_LABELS[id]}</strong><small>Registered</small>
        </div>)}
      </div>
      <div className="policy-fields">
        <label>Maximum input<input inputMode="decimal" value={values.amount}
          onChange={(event) => set("amount", event.target.value)} /></label>
        <label>Input asset<select value={values.inputToken}
          onChange={(event) => set("inputToken", event.target.value as Address)}>
          {INTENT_ASSETS.map(({ address, symbol }) =>
            <option key={address} value={address}>{symbol}</option>)}
        </select></label>
        <label>Maximum conversion loss (%)<input inputMode="decimal" max="5" min="0" step="0.1"
          type="number" value={values.maxConversionLossBps / 100}
          onChange={(event) => {
            const bps = percentageToBps(event.target.value);
            onChange({ ...values, maxConversionLossBps: bps,
              minimumReceiptValueBps: 10_000 - bps,
              minimumReceiptSource: "conversion-loss" });
          }} /></label>
        <label>Minimum registered receipt value (%)<input inputMode="decimal" max="100" min="95"
          step="0.1" type="number" value={values.minimumReceiptValueBps / 100}
          onChange={(event) => onChange({ ...values,
            minimumReceiptValueBps: percentageToBps(event.target.value),
            minimumReceiptSource: "explicit" })} />
          <small>{values.minimumReceiptSource === "conversion-loss"
            ? `Derived from the ${values.maxConversionLossBps / 100}% conversion-loss ceiling.`
            : "Explicit floor to be enforced by the verifier."}</small>
        </label>
        <label>Objective horizon (days)<input inputMode="numeric" min="1" max="365" type="number"
          value={values.horizonDays} onChange={(event) => onChange({ ...values,
            horizonDays: Number(event.target.value), horizonSource: "explicit" })} />
          <small>{values.horizonSource === "product-default" ? "Cobia default · editable" : "Explicit"}</small>
        </label>
        <label>Competition (minutes)<input inputMode="numeric" min="1" max="15" type="number"
          value={values.competitionDurationSec / 60}
          onChange={(event) => set("competitionDurationSec", Number(event.target.value) * 60)} /></label>
        <label>Execution deadline (minutes)<input inputMode="numeric" min="1" max="30" type="number"
          value={values.deadlineDurationSec / 60}
          onChange={(event) => set("deadlineDurationSec", Number(event.target.value) * 60)} /></label>
      </div>
      <dl className="policy-summary">
        <div><dt>Owner</dt><dd>{owner ?? "Connect wallet"}</dd></div>
        <div><dt>Input bound</dt><dd>{values.amount || "—"} {input.symbol}</dd></div>
        <div><dt>Objective</dt><dd>Maximum verified net yield</dd></div>
        <div><dt>Network</dt><dd>X Layer · chain 196</dd></div>
      </dl>
      <p className="policy-signing-note">No funds or approvals move when you sign this intent.</p>
    </section>
  );
}
