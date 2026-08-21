import {
  ArrowDown,
  ArrowUpRight,
  Check,
  Clock3,
  Code2,
  ShieldCheck,
  Sparkles,
  WalletCards,
} from "lucide-react";
import Link from "next/link";
import { ProtocolMark } from "../brand/ProtocolMark";
import styles from "./JudgeEvidence.module.css";

const MAINNET_DEPLOYMENT_TX = "0x2278a9241529becaf1baac9a3de7777fd5ab6051e0e65b3b4fc45e1e3f3fc767";
const TESTNET_DEPLOYMENT_TX = "0x68cff1d6bbba6b436d0be39cd91e772a811027519487a7fefe91d5bef81521a6";
const BUILDER_REGISTRATION_TX = "0xf9ee439cbc68a652f92c8d7522d8c76a54e6c3888ffde7468eb7ed32c6318ffa";

const boundary = [
  ["01", "Signed outcome", "The wallet commits the goal, assets, hard limits and deadline."],
  ["02", "Open generation", "Solvers propose unsigned programs and may revise or abstain."],
  ["03", "Independent proof", "Cobia checks identities, calldata, balances and fresh-fork outcomes."],
  ["04", "Wallet authority", "Only an exact accepted program is offered for owner approval."],
] as const;

const evidence = [
  {
    title: "Cobia on X Layer", status: "Live product",
    detail: "Intent creation, discovery, portfolios, solver evidence and wallet review on chain 196.",
    href: "https://getcobia.com", link: "Open product",
  },
  {
    title: "Executor V3 deployment", status: "Deployed",
    detail: "Wallet-created X Layer mainnet contract with independently reproduced creation input and runtime identity.",
    href: `https://www.oklink.com/x-layer/tx/${MAINNET_DEPLOYMENT_TX}`, link: "Inspect transaction",
  },
  {
    title: "X Layer testnet", status: "Deployed",
    detail: "Paused-by-design testnet contracts with canonical receipt anchors and public read-back evidence.",
    href: `https://www.oklink.com/x-layer-testnet/tx/${TESTNET_DEPLOYMENT_TX}`, link: "Inspect transaction",
  },
  {
    title: "Registered Builder Code", status: "Attributable",
    detail: "Cobia transactions bind registered Builder Code sq6dlj2onr8ml5xa before verification and signing.",
    href: `https://www.oklink.com/x-layer/tx/${BUILDER_REGISTRATION_TX}`, link: "Inspect registration",
  },
  {
    title: "Public source", status: "Public source",
    detail: "Verifier, solver exchange, replay service, contracts, tests and deployment evidence are reviewable.",
    href: "https://github.com/SebastianBoehler/cobia", link: "Browse repository",
  },
  {
    title: "Ethy AI via x402", status: "Pending canary",
    detail: "Awaiting the final production release. The 0.10 USD₮0 purchase will be published only with a real receipt.",
    href: "/discover", link: "Inspect supported offer", internal: true,
  },
] as const;

const supportedProtocols = ["Aave V3", "Curve StableSwap", "Uniswap V3"] as const;

const rubric = [
  ["AI application", "Agents research and propose programs; deterministic verification retains authorization authority."],
  ["Innovation", "Open-world generation is separated from fail-closed execution permission."],
  ["Product completeness", "A public product, two network deployments, persistent evidence and wallet-owned signing paths."],
  ["X Layer integration", "Chain 196 protocols, chain 1952 evidence, USD₮0 x402 settlement and Builder Code attribution."],
  ["Growth potential", "Each new solver, merchant and protocol expands the same independently verified intent market."],
  ["Ecosystem contribution", "Cobia is a transaction firewall that can turn agent demand into safer X Layer activity."],
] as const;

const roadmap = [
  ["Shipped", "Foundation", "Public product, open solver exchange, fresh-fork replay, X Layer deployments and one pinned x402 merchant."],
  ["Next proof", "Close the loop", "Settle the 0.10 USD₮0 Ethy canary after release, publish its receipt, resource hash and one tampered-term rejection."],
  ["30 days", "Expand supply", "Add OKLink paid data, QuickSwap route competition, one external solver and an X Layer ecosystem-directory submission."],
  ["90 days", "Earn distribution", "Ship a wallet integration kit, secure three design partners and prepare the verification surface for external audit."],
] as const;

function EvidenceLink({ item }: { item: typeof evidence[number] }) {
  const content = <>{item.link}<ArrowUpRight aria-hidden="true" size={15} /></>;
  return "internal" in item && item.internal
    ? <Link href={item.href}>{content}</Link>
    : <a href={item.href} rel="noreferrer" target="_blank">{content}</a>;
}

export function JudgeEvidence() {
  return <main className={styles.page} id="main-content">
    <section className={styles.hero}>
      <div className={styles.heroInner}>
        <div className={styles.heroCopy}>
          <h1>AI proposes. <span>Cobia proves what may execute.</span></h1>
          <p className={styles.lede}>An intent exchange and transaction firewall for X Layer. Solvers compete on outcomes while independent verification and the owner wallet keep authority.</p>
          <div className={styles.actions}>
            <a className="button button--primary" href="https://getcobia.com" rel="noreferrer" target="_blank">
              Open live product <ArrowUpRight aria-hidden="true" size={16} />
            </a>
            <a className="text-link" href="https://github.com/SebastianBoehler/cobia" rel="noreferrer" target="_blank">Inspect source</a>
          </div>
        </div>
        <div aria-label="Cobia verification sequence" className={styles.signal}>
          <div className={styles.signalHead}>
            <span><ShieldCheck aria-hidden="true" size={17} /> Independent verifier</span>
            <strong>Chain 196</strong>
          </div>
          <div className={styles.trace} aria-hidden="true"><span /><i /><i /><i /><i /></div>
          <div className={styles.signalStages}>
            <span><Sparkles aria-hidden="true" size={15} /> Proposal</span>
            <span><Code2 aria-hidden="true" size={15} /> Replay</span>
            <span><Check aria-hidden="true" size={15} /> Verdict</span>
            <span><WalletCards aria-hidden="true" size={15} /> Approval</span>
          </div>
          <div className={styles.signalVerdict}>
            <strong>Exact calls only</strong>
            <p>AI receives no signing key or production send method.</p>
          </div>
        </div>
      </div>
      <a className={styles.scrollCue} href="#boundary">Read the evidence <ArrowDown aria-hidden="true" size={15} /></a>
    </section>

    <section className={styles.boundary} id="boundary">
      <header><h2>Creative search.<br />Verified authorization.</h2></header>
      <ol>{boundary.map(([number, title, detail]) => <li key={number}>
        <div><h3>{title}</h3><p>{detail}</p></div>
      </li>)}</ol>
    </section>

    <section className={styles.protocols} aria-labelledby="protocols-title">
      <div>
        <h2 id="protocols-title">Protocols that already enter verified programs.</h2>
        <p>Aave supply plus Curve and Uniswap exact-input routes are pinned to explicit X Layer adapters and independently replayed before wallet review.</p>
      </div>
      <ul>{supportedProtocols.map((protocol) => <li key={protocol}>
        <ProtocolMark protocol={protocol} size={58} />
        <strong>{protocol}</strong>
      </li>)}</ul>
    </section>

    <section className={styles.evidence} id="evidence">
      <header className={styles.sectionHeader}>
        <div><h2>Claims that resolve to something inspectable.</h2></div>
        <a href="https://x.com/Cobia_Web3/status/2090604315052302774" rel="noreferrer" target="_blank">
          BuildX post <ArrowUpRight aria-hidden="true" size={15} />
        </a>
      </header>
      <div className={styles.evidenceList}>{evidence.map((item) => <article key={item.title}>
        <div className={styles.evidenceIndex}><strong>{item.status}</strong></div>
        <div><h3>{item.title}</h3><p>{item.detail}</p></div>
        <EvidenceLink item={item} />
      </article>)}</div>
    </section>

    <section className={styles.rubric}>
      <header className={styles.sectionHeader}><div><h2>Built around the judging lens.</h2></div></header>
      <dl>{rubric.map(([term, detail]) => <div key={term}><dt>{term}</dt><dd>{detail}</dd></div>)}</dl>
    </section>

    <section className={styles.roadmap} id="roadmap">
      <header className={styles.sectionHeader}>
        <div><h2>Proof first. Supply next. Distribution follows.</h2></div>
        <strong className={styles.roadmapNote}>Targets, not shipped claims</strong>
      </header>
      <ol>{roadmap.map(([time, title, detail]) => <li key={time}>
        <div className={styles.roadmapMarker}><i aria-hidden="true" /></div>
        <div><p className={styles.roadmapTime}>{time}</p><h3>{title}</h3><p>{detail}</p></div>
      </li>)}</ol>
    </section>

    <section className={styles.close}>
      <div><h2>State the outcome.<br />Keep the keys.</h2></div>
      <div className={styles.closeActions}>
        <a className="button button--paper" href="https://getcobia.com" rel="noreferrer" target="_blank">Review Cobia <ArrowUpRight aria-hidden="true" size={16} /></a>
        <a href="https://web3.okx.com/xlayer/build-x-series" rel="noreferrer" target="_blank">BuildX AI Season rules <ArrowUpRight aria-hidden="true" size={14} /></a>
      </div>
      <p className={styles.closeNote}><Clock3 aria-hidden="true" size={14} /> Financial controls remain gated until their independent production release checks pass.</p>
    </section>
  </main>;
}
