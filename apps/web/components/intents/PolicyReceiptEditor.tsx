import type { Address } from "viem";
import {
  CAPABILITY_TEMPLATES, INTENT_ASSETS, RWA_INTENT_ASSETS, atomicLabel,
  type CapabilityTemplateId, type IntentReceiptValues,
} from "../../lib/intents/capability-templates";

export type ReceiptValues = IntentReceiptValues;

export function PolicyReceiptEditor({ values, owner, onChange }: {
  values: ReceiptValues;
  owner: Address | null;
  onChange(values: ReceiptValues): void;
}) {
  const rwa = values.templateId === "rwa-acquisition";
  const input = INTENT_ASSETS.find(({ address }) => address === values.inputToken) ?? INTENT_ASSETS[0];
  const output = rwa
    ? RWA_INTENT_ASSETS.find(({ address }) => address === values.outputToken) ?? RWA_INTENT_ASSETS[0]
    : INTENT_ASSETS.find(({ address }) => address === values.outputToken) ?? INTENT_ASSETS[1];
  const instrument = rwa && "instrument" in output ? output.instrument : undefined;
  const set = <K extends keyof ReceiptValues>(key: K, value: ReceiptValues[K]) => onChange({
    ...values, [key]: value,
    ...(key === "amount" || key === "inputToken" || key === "outputToken" || key === "minimum"
      ? { minimumSource: undefined } : {}),
  });
  const minimumLabel = values.templateId === "aave-supply" ? "Minimum receipt is verifier-derived at 99.5%" : atomicLabel(values.minimum, values.templateId === "round-trip" ? input.symbol : output.symbol);

  return (
    <section className="policy-editor" aria-labelledby="policy-receipt-title">
      <header><div><h2 id="policy-receipt-title">Review the policy</h2><p>These typed fields—not the prose alone—define what may execute.</p></div></header>
      <div className="policy-fields">
        <label>Verified capability<select value={values.templateId} onChange={(event) => {
          const templateId = event.target.value as CapabilityTemplateId;
          onChange(templateId === "rwa-acquisition"
            ? { ...values, templateId, inputToken: INTENT_ASSETS[0]!.address,
              outputToken: RWA_INTENT_ASSETS[0]!.address,
              jurisdiction: "", eligibilityAccepted: true, minimumSource: undefined }
            : { ...values, templateId, inputToken: INTENT_ASSETS[0]!.address,
              outputToken: INTENT_ASSETS[1]!.address, eligibilityAccepted: false, minimumSource: undefined });
        }}>{CAPABILITY_TEMPLATES.map(({ id, label }) => <option key={id} value={id}>{label}</option>)}</select></label>
        <label>Maximum input<input inputMode="decimal" value={values.amount} onChange={(event) => set("amount", event.target.value)} /></label>
        <label>Input asset<select value={values.inputToken} onChange={(event) => set("inputToken", event.target.value as Address)}>{INTENT_ASSETS.map(({ address, symbol }) => <option key={address} value={address}>{symbol}</option>)}</select></label>
        {values.templateId === "exact-input-swap" ? <label>Output asset<select value={values.outputToken} onChange={(event) => set("outputToken", event.target.value as Address)}>{INTENT_ASSETS.filter(({ address }) => address !== values.inputToken).map(({ address, symbol }) => <option key={address} value={address}>{symbol}</option>)}</select></label> : null}
        {rwa ? <label>Output asset<select value={values.outputToken} onChange={(event) => {
          const outputToken = event.target.value as Address;
          onChange({ ...values, outputToken, jurisdiction: "", eligibilityAccepted: true,
            minimumSource: undefined });
        }}>{RWA_INTENT_ASSETS.map(({ address, symbol, instrument: item }) => <option key={address} value={address}>{symbol} · {item.platform}</option>)}</select></label> : null}
        {values.templateId !== "aave-supply" ? <label>{values.templateId === "round-trip" ? "Minimum profit" : "Minimum output"}<input inputMode="decimal" value={values.minimum} onChange={(event) => set("minimum", event.target.value)} />
          {values.minimumSource === "stablecoin-default" ? <small>Auto-set to a 1% USDG/USDt0 protection floor. Review or edit it before signing.</small> : null}
        </label> : null}
        <div className="policy-fee" role="status"><strong>No solver fee during launch</strong>
          <span>Cobia currently waives the solver success fee. Signing and verified execution remain separate wallet confirmations.</span>
        </div>
      </div>
      <dl className="policy-summary">
        <div><dt>Owner</dt><dd>{owner ?? "Connect wallet"}</dd></div>
        <div><dt>Input bound</dt><dd>{atomicLabel(values.amount, input.symbol)}</dd></div>
        <div><dt>Minimum result</dt><dd>{minimumLabel}</dd></div>
        <div><dt>Competition</dt><dd>5 minutes · up to 5 revisions per solver</dd></div>
        <div><dt>Solver fee</dt><dd>Waived during launch</dd></div>
        <div><dt>Execution deadline</dt><dd>30 minutes from signing</dd></div>
        <div><dt>Network</dt><dd>{rwa && instrument?.chainId === 1
          ? "Ethereum · chain 1 (anchored with X Layer)" : "X Layer · chain 196"}</dd></div>
      </dl>
      <p className="policy-signing-note">No funds or approvals move when you sign this intent.</p>
    </section>
  );
}
