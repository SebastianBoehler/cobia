import { ArrowRight, Bot, Code2, Users } from "lucide-react";
import Link from "next/link";
import { ProtocolMark } from "../brand/ProtocolMark";

export interface SolverDirectoryItem {
  id: string;
  displayName: string;
  operatorKind: "internal" | "community";
  declaredCapabilities: string[];
  stats: { accepted: number; rejected: number; wins: number; current: number };
}

const capabilityPresentation: Record<string, { label: string; protocol?: string }> = {
  "aave-v3.positions": { label: "Aave V3 · Positions", protocol: "Aave V3" },
  "aave-v3.supply": { label: "Aave V3 · Supply", protocol: "Aave V3" },
  "curve-stableswap-ng.exact-input": { label: "Curve · Exact input", protocol: "Curve" },
  "curve-stableswap-ng.liquidity": { label: "Curve · Liquidity", protocol: "Curve" },
  "uniswap-v3.exact-input": { label: "Uniswap V3 · Exact input", protocol: "Uniswap V3" },
  "uniswap-v3.swaps": { label: "Uniswap V3 · Swaps", protocol: "Uniswap V3" },
  "okx.dex-routing": { label: "OKX · DEX routing", protocol: "OKX" },
  "xlayer.native-okb": { label: "X Layer · Native OKB", protocol: "X Layer" },
  "pendle.xlayer.market-discovery": { label: "Pendle · Market discovery", protocol: "Pendle" },
  "evm.raw": { label: "Raw EVM" },
  "general.evm-program": { label: "General EVM program" },
};

function CapabilityBadge({ capability }: { capability: string }) {
  const separator = capability.lastIndexOf("@");
  const id = separator > 0 ? capability.slice(0, separator) : capability;
  const version = separator > 0 ? capability.slice(separator + 1) : null;
  const presentation = capabilityPresentation[id];

  return <li className="solver-capability" title={capability}>
    {presentation?.protocol
      ? <ProtocolMark protocol={presentation.protocol} size={18} />
      : <Code2 aria-hidden="true" size={16} />}
    <span>{presentation?.label ?? id}</span>
    {version ? <code>@{version}</code> : null}
  </li>;
}

export function SolverDirectory({ solvers }: { solvers: SolverDirectoryItem[] }) {
  if (solvers.length === 0) return <p className="empty-state">No solver identities are registered yet.</p>;
  return <div className="solver-directory">{solvers.map((solver) => {
    const Icon = solver.operatorKind === "community" ? Users : Bot;
    return <article key={solver.id}>
      <header><Icon aria-hidden="true" size={20} /><div><h2>{solver.displayName}</h2><p>{solver.operatorKind === "community" ? "Community operator" : "Cobia operator"}</p></div></header>
      <div className="solver-directory__columns">
        <section><h3>Verifier-derived results</h3><dl><div><dt>Accepted</dt><dd>{solver.stats.accepted}</dd></div><div><dt>Rejected</dt><dd>{solver.stats.rejected}</dd></div><div><dt>Wins</dt><dd>{solver.stats.wins}</dd></div></dl></section>
        <section><h3>Operator-declared capabilities</h3><ul>{solver.declaredCapabilities.map((capability) => <CapabilityBadge capability={capability} key={capability} />)}</ul></section>
      </div>
      <Link href={`/solvers/${solver.id}`}>Review verifier evidence <ArrowRight aria-hidden="true" size={15} /></Link>
    </article>;
  })}</div>;
}
