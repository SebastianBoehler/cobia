import type { StagedConversionDraft } from "../../lib/intents/staged-conversion-draft";

export function StagedConversionPolicyEditor({ values, onChange }: {
  values: StagedConversionDraft;
  onChange(values: StagedConversionDraft): void;
}) {
  return <section className="policy-editor" aria-labelledby="staged-conversion-title">
    <header><div><h2 id="staged-conversion-title">Review the staged conversion</h2>
      <p>One signed intent binds every input. Each verified wallet stage still needs confirmation.</p></div></header>
    <div className="policy-fields">
      {values.inputs.map((input, index) => <label key={input.token}>
        {`Maximum input · ${input.symbol}`}
        <input aria-label={`Maximum input · ${input.symbol}`} inputMode="decimal"
          value={input.amount} onChange={(event) => onChange({ ...values,
            inputs: values.inputs.map((item, itemIndex) => itemIndex === index
              ? { ...item, amount: event.target.value } : item),
            minimumSource: undefined })} />
        <small>{input.kind === "native" ? "Native OKB" : `ERC-20 · ${input.token}`}</small>
      </label>)}
      <label>Output asset<input readOnly value={values.outputSymbol} /></label>
      <label>Minimum total output<input inputMode="decimal" value={values.minimum}
        onChange={(event) => onChange({ ...values, minimum: event.target.value,
          minimumSource: undefined })} />
        {values.minimumSource === "market-default" ? <small>
          Auto-set to 99% of the fresh combined USD value. Review or edit it before signing.
        </small> : null}
      </label>
    </div>
    <dl className="policy-summary">
      <div><dt>Program</dt><dd>{values.inputs.length} ordered wallet stages</dd></div>
      <div><dt>Outcome</dt><dd>At least {values.minimum} {values.outputSymbol}</dd></div>
      <div><dt>Execution</dt><dd>Separately confirmed · not atomic</dd></div>
      <div><dt>Network</dt><dd>X Layer · chain 196</dd></div>
    </dl>
    <p className="policy-signing-note">Signing publishes authority only. It does not move either input.</p>
  </section>;
}
