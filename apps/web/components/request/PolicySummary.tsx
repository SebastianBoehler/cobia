import { Check, ShieldCheck, Wallet } from "lucide-react";

interface PolicySummaryProps {
  principal: string;
  exposure: string;
  minimumTvl: string;
  minimumApy: string;
}

const constraints = [
  { icon: Check, label: "No bridges" },
  { icon: ShieldCheck, label: "Deterministic verification" },
  { icon: Wallet, label: "Principal stays in your wallet" },
] as const;

export function PolicySummary(props: PolicySummaryProps) {
  return (
    <aside className="policy-receipt" aria-label="Policy summary">
      <div className="policy-receipt__heading">
        <span>Policy receipt</span>
        <span className="status-dot">Ready to sign</span>
      </div>
      <dl className="policy-receipt__metrics">
        <div>
          <dt>Principal</dt>
          <dd>{props.principal}</dd>
        </div>
        <div>
          <dt>Protocol exposure</dt>
          <dd>{props.exposure}</dd>
        </div>
        <div>
          <dt>Minimum TVL</dt>
          <dd>{props.minimumTvl}</dd>
        </div>
        <div>
          <dt>Minimum net APY</dt>
          <dd>{props.minimumApy}</dd>
        </div>
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
