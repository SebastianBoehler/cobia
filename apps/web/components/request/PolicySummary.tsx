import { Check, ShieldCheck, Wallet } from "lucide-react";

interface PolicySummaryProps {
  metrics: readonly { label: string; value: string }[];
  outputAssets: string;
  adapters: string;
  maximumSlippage: string;
  horizon?: string;
  snapshotAge: string;
  intentLifetime: string;
}

export function PolicySummary(props: PolicySummaryProps) {
  const constraints = [
    { icon: Check, label: "No bridges" },
    { icon: ShieldCheck, label: `Outputs: ${props.outputAssets}` },
    { icon: ShieldCheck, label: `Adapters: ${props.adapters}` },
    { icon: ShieldCheck, label: `Maximum swap slippage: ${props.maximumSlippage}` },
    ...(props.horizon
      ? [{ icon: ShieldCheck, label: `Yield horizon: ${props.horizon}` }]
      : []),
    { icon: ShieldCheck, label: `Maximum snapshot age: ${props.snapshotAge}` },
    { icon: ShieldCheck, label: `Intent lifetime: ${props.intentLifetime}` },
    { icon: ShieldCheck, label: "Deterministic recomputation" },
    { icon: Wallet, label: "Principal stays in your wallet until separately confirmed execution" },
  ] as const;
  return (
    <aside className="policy-receipt" aria-label="Policy summary">
      <div className="policy-receipt__heading">
        <span>Policy receipt</span>
        <span className="status-dot">Ready to sign</span>
      </div>
      <dl className="policy-receipt__metrics">
        {props.metrics.map(({ label, value }) => <div key={label}>
          <dt>{label}</dt>
          <dd>{value}</dd>
        </div>)}
      </dl>
      <ul className="policy-receipt__constraints">
        {constraints.map(({ icon: Icon, label }) => (
          <li key={label}>
            <Icon aria-hidden="true" size={15} strokeWidth={2} />
            {label}
          </li>
        ))}
      </ul>
    </aside>
  );
}
