import {
  ArrowDown,
  ArrowUpRight,
  Check,
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
const FIRST_VERIFIED_INTENT_TX = "0x83500273bbdaf6f2ad5e27f3d6807b7555383599ea537eca0206f9c18ab0d210";
const XLAYER_ENDGAME_POST = "https://x.com/XLayerOfficial/status/2091166000142012900";

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
    title: "First mainnet intent outcome", status: "Confirmed outcome",
    detail: "An owner-approved Cobia program swapped 1 USDt0 for 0.999471 USDG on X Layer and carried the registered Builder Code.",
    href: `https://web3.okx.com/explorer/x-layer/evm/tx/${FIRST_VERIFIED_INTENT_TX}`, link: "Inspect execution",
  },
  {
    title: "Cobia Network", status: "Public proof",
    detail: "Confirmed outcomes and solver attribution resolve to exact programs, receipts and X Layer transactions.",
    href: "/network", link: "Inspect network", internal: true,
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
] as const;

const supportedProtocols = ["Aave V3", "Curve StableSwap", "Uniswap V3"] as const;

const foundations = [
  ["AI application", "AI solvers research, write, and test transaction plans while deterministic verification retains authorization authority."],
  ["Innovation", "Open-ended generation is separated from fail-closed execution permission."],
  ["Product completeness", "A live product, 25+ confirmed outcomes, signed solver histories, and public receipts run on X Layer mainnet."],
  ["User value", "Owners use AI assistance without giving an agent a private key, wallet handle, or production send method."],
  ["X Layer native", "Chain 196 protocols, mainnet receipts, testnet deployment evidence, and Builder Code attribution are built into the product."],
  ["Ecosystem growth", "Each new solver, merchant, and protocol expands the same independently verified transaction market."],
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
          <p className={styles.eyebrow}>Build X · General Hackathon</p>
          <h1>AI proposes. <span>Cobia proves what may execute.</span></h1>
          <p className={styles.lede}>Cobia is the transaction firewall for AI agents on X Layer. Competing solvers build transaction plans, Cobia independently replays every call, and only the owner wallet can approve the exact verified plan.</p>
          <div className={styles.actions}>
            <Link className="button button--primary" href="/intents/new">
              Describe an outcome <ArrowUpRight aria-hidden="true" size={16} />
            </Link>
            <a className="text-link" href="#evidence">See mainnet proof</a>
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
      <ul className={styles.proofStrip} aria-label="Cobia live proof summary">
        <li>Live on chain 196</li>
        <li>25+ confirmed outcomes</li>
        <li>3 signed solver profiles</li>
        <li>Public programs, receipts, and source</li>
      </ul>
      <a className={styles.scrollCue} href="#product-proof">Watch the product proof <ArrowDown aria-hidden="true" size={15} /></a>
    </section>

    <section className={styles.productProof} id="product-proof" aria-labelledby="product-proof-title">
      <div>
        <h2 id="product-proof-title">One intent, from outcome to evidence.</h2>
        <p>See Cobia turn a natural-language goal into explicit limits, solver proposals, independent proof, wallet review, and an inspectable X Layer result.</p>
        <a className="text-link" href="#evidence">Inspect the mainnet evidence</a>
      </div>
      <video controls playsInline poster="/media/cobia-intent-proof-poster.jpg" preload="metadata">
        <source src="/media/cobia-live-intent-flow-x-layer.mp4" type="video/mp4" />
      </video>
    </section>

    <section className={styles.evidence} id="evidence">
      <header className={styles.sectionHeader}>
        <div><h2>Claims that resolve to something inspectable.</h2></div>
        <a href="https://x.com/Cobia_Web3/status/2090604315052302774" rel="noreferrer" target="_blank">
          Build X post <ArrowUpRight aria-hidden="true" size={15} />
        </a>
      </header>
      <div className={styles.evidenceList}>{evidence.map((item) => <article key={item.title}>
        <div className={styles.evidenceIndex}><strong>{item.status}</strong></div>
        <div><h3>{item.title}</h3><p>{item.detail}</p></div>
        <EvidenceLink item={item} />
      </article>)}</div>
    </section>

    <section className={styles.boundary} id="boundary">
      <header><h2>Let AI search.<br />Keep execution exact.</h2></header>
      <ol>{boundary.map(([number, title, detail]) => <li key={number}>
        <div><h3>{title}</h3><p>{detail}</p></div>
      </li>)}</ol>
    </section>

    <section className={styles.protocols} aria-labelledby="protocols-title">
      <div>
        <h2 id="protocols-title">Protocols already entering verified plans.</h2>
        <p>Aave supply plus Curve and Uniswap swaps are pinned to explicit X Layer adapters and independently replayed before wallet review.</p>
      </div>
      <ul>{supportedProtocols.map((protocol) => <li key={protocol}>
        <ProtocolMark protocol={protocol} size={58} />
        <strong>{protocol}</strong>
      </li>)}</ul>
    </section>

    <section className={styles.foundations} aria-labelledby="foundations-title">
      <header className={styles.sectionHeader}><div><h2 id="foundations-title">Why Cobia matters to X Layer.</h2></div></header>
      <div className={styles.vision}>
        <div className={styles.visionCopy}>
          <h3>Every asset, everywhere—without giving AI the keys.</h3>
          <p>X Layer is making every asset accessible. Cobia answers the next question: who decides what AI may execute? Solvers can search broadly; signed limits, independent replay, and wallet approval decide exactly what moves.</p>
          <strong>Live on X Layer mainnet today, with the same verification boundary expanding toward general-asset execution.</strong>
        </div>
        <div className={styles.visionPost}>
          <iframe
            loading="lazy"
            src="https://platform.twitter.com/embed/Tweet.html?id=2091166000142012900&dnt=true&theme=light"
            title="X Layer post: every asset, everywhere, accessible on X Layer"
          />
          <a href={XLAYER_ENDGAME_POST} rel="noreferrer" target="_blank">View the post on X <ArrowUpRight aria-hidden="true" size={14} /></a>
        </div>
      </div>
      <dl>{foundations.map(([term, detail]) => <div key={term}><dt>{term}</dt><dd>{detail}</dd></div>)}</dl>
    </section>

    <section className={styles.close}>
      <div><h2>State the outcome.<br />Keep the keys.</h2></div>
      <div className={styles.closeActions}>
        <a className="button button--paper" href="https://getcobia.com" rel="noreferrer" target="_blank">Review Cobia <ArrowUpRight aria-hidden="true" size={16} /></a>
        <a href="https://web3.okx.com/xlayer/build-x-series" rel="noreferrer" target="_blank">AI Season rules <ArrowUpRight aria-hidden="true" size={14} /></a>
      </div>
      <p className={styles.closeNote}><ShieldCheck aria-hidden="true" size={14} /> New permissions activate only after independent production checks and governance read-back.</p>
    </section>
  </main>;
}
