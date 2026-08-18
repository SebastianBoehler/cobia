import type { Address } from "viem";
import {
  CAPABILITY_TEMPLATES, INTENT_ASSETS, atomicLabel,
  type CapabilityTemplateId, type IntentReceiptValues,
} from "../../lib/intents/capability-templates";

export type ReceiptValues = IntentReceiptValues;

export function PolicyReceiptEditor({ values, owner, onChange }: {
  values: ReceiptValues;
  owner: Address | null;
  onChange(values: ReceiptValues): void;
}) {
  const input = INTENT_ASSETS.find(({ address }) => address === values.inputToken) ?? INTENT_ASSETS[0];
  const output = INTENT_ASSETS.find(({ address }) => address === values.outputToken) ?? INTENT_ASSETS[1];
  const set = <K extends keyof ReceiptValues>(key: K, value: ReceiptValues[K]) => onChange({ ...values, [key]: value });
  const minimumLabel = values.templateId === "aave-supply" ? "Minimum receipt is verifier-derived at 99.5%" : atomicLabel(values.minimum, values.templateId === "round-trip" ? input.symbol : output.symbol);

  return (
    <section className="policy-editor" aria-labelledby="policy-receipt-title">
      <header><div><h2 id="policy-receipt-title">Policy receipt</h2><p>These typed fields—not the prose alone—define what may execute.</p></div><span>Unsigned draft</span></header>
      <div className="policy-fields">
        <label>Verified capability<select value={values.templateId} onChange={(event) => set("templateId", event.target.value as CapabilityTemplateId)}>{CAPABILITY_TEMPLATES.map(({ id, label }) => <option key={id} value={id}>{label}</option>)}</select></label>
        <label>Maximum input<input inputMode="decimal" value={values.amount} onChange={(event) => set("amount", event.target.value)} /></label>
        <label>Input asset<select value={values.inputToken} onChange={(event) => set("inputToken", event.target.value as Address)}>{INTENT_ASSETS.map(({ address, symbol }) => <option key={address} value={address}>{symbol}</option>)}</select></label>
        {values.templateId === "exact-input-swap" ? <label>Output asset<select value={values.outputToken} onChange={(event) => set("outputToken", event.target.value as Address)}>{INTENT_ASSETS.filter(({ address }) => address !== values.inputToken).map(({ address, symbol }) => <option key={address} value={address}>{symbol}</option>)}</select></label> : null}
        {values.templateId !== "aave-supply" ? <label>{values.templateId === "round-trip" ? "Minimum profit" : "Minimum output"}<input inputMode="decimal" value={values.minimum} onChange={(event) => set("minimum", event.target.value)} /></label> : null}
      </div>
      <dl className="policy-summary">
        <div><dt>Owner</dt><dd>{owner ?? "Connect wallet"}</dd></div>
        <div><dt>Input bound</dt><dd>{atomicLabel(values.amount, input.symbol)}</dd></div>
        <div><dt>Minimum result</dt><dd>{minimumLabel}</dd></div>
        <div><dt>Competition</dt><dd>5 minutes · up to 5 revisions per solver</dd></div>
        <div><dt>Execution deadline</dt><dd>30 minutes from signing</dd></div>
        <div><dt>Network</dt><dd>X Layer · chain 196</dd></div>
      </dl>
      <p className="policy-signing-note">No funds or approvals move when you sign this intent.</p>
    </section>
  );
}
