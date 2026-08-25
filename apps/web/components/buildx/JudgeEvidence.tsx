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
import { CONFIRMED_OUTCOME_LABEL, PUBLIC_PROOF } from "../../lib/public-proof";
import { ProtocolMark } from "../brand/ProtocolMark";
import { XStocksMark } from "../brand/XStocksMark";
import styles from "./JudgeEvidence.module.css";

const MAINNET_DEPLOYMENT_TX = "0x2278a9241529becaf1baac9a3de7777fd5ab6051e0e65b3b4fc45e1e3f3fc767";
const TESTNET_DEPLOYMENT_TX = "0x68cff1d6bbba6b436d0be39cd91e772a811027519487a7fefe91d5bef81521a6";
const BUILDER_REGISTRATION_TX = "0xf9ee439cbc68a652f92c8d7522d8c76a54e6c3888ffde7468eb7ed32c6318ffa";
const FIRST_VERIFIED_INTENT_TX = "0x83500273bbdaf6f2ad5e27f3d6807b7555383599ea537eca0206f9c18ab0d210";
const V4_VERIFIED_INTENT_TX = "0x573cf9e9e0c21e4cf1585cc4a4ec36a56d4063c779bb3de4e8bf514c56e2543f";
const V4_PROGRAM_ID = "4d1ccd00-1b2d-485a-9f57-6e4416959126";
const XSTOCKS_PROGRAM_ID = PUBLIC_PROOF.xStocks.programId;
const XSTOCKS_VERIFIED_INTENT_TX = PUBLIC_PROOF.xStocks.transactionHash;
const XLAYER_ENDGAME_POST = "https://x.com/XLayerOfficial/status/2091166000142012900";

const boundary = [
  ["01", "Set your limits", "Choose the outcome, assets, spending limit, minimum result, and deadline."],
  ["02", "Solvers compete", "Independent AI solvers search for the best way to reach your outcome."],
  ["03", "Cobia verifies", "Every proposed call is replayed against fresh chain state and your limits."],
  ["04", "You decide", "Your wallet sees only a plan that passed—and you still choose whether to approve it."],
] as const;

const evidence = [
  {
    title: "Try Cobia on X Layer", status: "Live product",
    detail: "Create an intent, compare solver proposals, and review a verified plan before your wallet approves it.",
    href: "https://getcobia.com", link: "Try Cobia",
  },
  {
    title: "Verified V4 standard-token result", status: "V4 · Mainnet proof",
    detail: "A second wallet used Cobia V4 to turn 0.01 OKB into 1.169308 USDG. The public program includes the exact verified route, receipt, and X Layer transaction.",
    href: `https://web3.okx.com/explorer/x-layer/evm/tx/${V4_VERIFIED_INTENT_TX}`,
    link: "Verify V4 transaction",
  },
  {
    title: "Verified xStocks acquisition", status: "xStocks · Mainnet proof",
    detail: "Cobia acquired 0.002841620235604251 TSLAx with USDG on X Layer mainnet. The confirmed transaction proves the registered token reached the owner wallet.",
    href: `https://web3.okx.com/explorer/x-layer/evm/tx/${XSTOCKS_VERIFIED_INTENT_TX}`,
    link: "Verify TSLAx transaction",
  },
  {
    title: "First verified mainnet result", status: "Proven on mainnet",
    detail: "A user approved a Cobia plan that converted 1 USDt0 into 0.999471 USDG. The public X Layer transaction proves the result.",
    href: `https://web3.okx.com/explorer/x-layer/evm/tx/${FIRST_VERIFIED_INTENT_TX}`, link: "Verify the result",
  },
  {
    title: "Cobia Network", status: "Public proof",
    detail: "Every confirmed result links the solver, verified plan, receipt, and X Layer transaction—no trust-me metrics.",
    href: "/network", link: "Explore results", internal: true,
  },
  {
    title: "Mainnet execution contract", status: "Deployed",
    detail: "Cobia’s wallet execution contract is live on X Layer and reproducible from the public source.",
    href: `https://www.oklink.com/x-layer/tx/${MAINNET_DEPLOYMENT_TX}`, link: "Verify deployment",
  },
  {
    title: "X Layer testnet", status: "Rehearsal environment",
    detail: "A separate testnet deployment lets new capabilities be rehearsed without presenting them as production-ready.",
    href: `https://www.oklink.com/x-layer-testnet/tx/${TESTNET_DEPLOYMENT_TX}`, link: "Verify deployment",
  },
  {
    title: "X Layer ecosystem attribution", status: "Registered",
    detail: "Verified Cobia transactions are attributed through X Layer’s builder program, making product activity measurable without changing who controls the wallet.",
    href: `https://www.oklink.com/x-layer/tx/${BUILDER_REGISTRATION_TX}`, link: "Verify registration",
  },
  {
    title: "Public source", status: "Public source",
    detail: "Review the verifier, solver exchange, contracts, tests, and deployment history on GitHub.",
    href: "https://github.com/SebastianBoehler/cobia", link: "Review the code",
  },
] as const;

const supportedIntegrations = [
  { label: "OKX DEX", detail: "V4 exchange · Live", kind: "protocol" },
  { label: "Aave V3", detail: "Lending", kind: "protocol" },
  { label: "Curve StableSwap", detail: "Exchange", kind: "protocol" },
  { label: "Uniswap V3", detail: "Exchange", kind: "protocol" },
  { label: "xStocks", detail: "TSLAx acquisition · Live", kind: "asset-rail" },
] as const;

const foundations = [
  ["Useful AI, bounded risk", "Solvers can research and test many routes, but they cannot bypass your limits or approve a transaction."],
  ["A better trust model", "Cobia separates creative planning from permission to execute, so more capable AI does not require weaker wallet safety."],
  ["Working today", `Inspect ${CONFIRMED_OUTCOME_LABEL} from four winning solvers, including confirmed TSLAx acquisition, with public programs, receipts, and mainnet transactions.`],
  ["Your keys stay yours", "No solver receives your private key, wallet connection, or a way to send a production transaction."],
  ["Built around X Layer", "Live contracts, protocol integrations, public receipts, and builder attribution make X Layer the product’s execution home."],
  ["More choice without blind trust", "New solvers, merchants, and protocols can join the same competition and independent verification model."],
] as const;

const capabilities = [
  ["Live · V4", "Standard-token exchange", "Route verified standard ERC-20s on X Layer through bounded OKX DEX calls, pinned by exact chain and contract address."],
  ["Live · Mainnet proof", "Registered xStocks acquisition", "Acquire registered TSLAx through exact-identity V4 swaps with signed limits, fresh replay, and final wallet approval."],
  ["Live", "Lending", "Supply to Aave V3 with a signed spend ceiling, minimum receipt balance, fresh replay, and final wallet approval."],
  ["Verified path", "Liquidity provision", "Build and replay a one-sided, full-range Uniswap V3 LP entry before stepwise wallet execution."],
  ["Live · Bounded", "x402 payments", "Purchase an exactly pinned merchant resource on its declared payment network, with product, price, payee, payer, and deadline bound."],
  ["Implemented", "Multi-step portfolio goals", "Compose registered swap → supply actions and rank proposals by expected terminal portfolio value after forecast yield, gas, and solver fees."],
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
          <h1>AI finds the route. <span>Cobia proves every step stays within your limits.</span></h1>
          <p className={styles.lede}>Use AI for onchain transactions without handing it control of your wallet. Solvers can search across swaps, lending, liquidity, and payments; Cobia independently tests every supported call before you decide whether to approve it.</p>
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
            <strong>What you review is what runs</strong>
            <p>AI never receives your signing key or a way to send the transaction.</p>
          </div>
        </div>
      </div>
      <ul className={styles.proofStrip} aria-label="Cobia live proof summary">
        <li>Live on chain 196</li>
        <li>{CONFIRMED_OUTCOME_LABEL}</li>
        <li>{PUBLIC_PROOF.winningSolvers} winning solvers</li>
        <li>TSLAx mainnet proof</li>
      </ul>
      <a className={styles.scrollCue} href="#product-proof">Watch the product proof <ArrowDown aria-hidden="true" size={15} /></a>
    </section>

    <section className={styles.productProof} id="product-proof" aria-labelledby="product-proof-title">
      <div>
        <h2 id="product-proof-title">V4 and xStocks are live on X Layer mainnet.</h2>
        <p>The public programs prove a bounded V4 swap and a registered TSLAx acquisition. The recording shows the complete intent flow; inspect both confirmed results yourself.</p>
        <div className={styles.proofLinks}>
          <Link className="text-link" href={`/programs/${XSTOCKS_PROGRAM_ID}`}>Inspect the TSLAx result</Link>
          <Link className="text-link" href={`/programs/${V4_PROGRAM_ID}`}>Inspect the V4 result</Link>
        </div>
      </div>
      <figure>
        <video controls playsInline poster="/media/cobia-intent-proof-poster.jpg" preload="metadata">
          <source src="/media/cobia-live-intent-flow-x-layer.mp4" type="video/mp4" />
        </video>
        <figcaption>Existing product-flow demo · Recorded before V4 and xStocks opened. The linked public programs and transactions are the current mainnet proof.</figcaption>
      </figure>
    </section>

    <section className={styles.evidence} id="evidence">
      <header className={styles.sectionHeader}>
        <div><h2>Every claim links to public proof.</h2></div>
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
        <h2 id="protocols-title">Move, earn, and diversify through plans Cobia can verify.</h2>
        <p>V4 standard-token exchange, registered TSLAx acquisition, Aave supply, and Curve and Uniswap swaps are live on X Layer. Every route keeps exact asset identity, signed limits, independent replay, and wallet-controlled approval.</p>
      </div>
      <ul>{supportedIntegrations.map((integration) => <li key={integration.label}>
        {integration.kind === "protocol"
          ? <ProtocolMark protocol={integration.label} size={58} />
          : <XStocksMark size={58} />}
        <div><strong>{integration.label}</strong><small>{integration.detail}</small></div>
      </li>)}</ul>
    </section>

    <section className={styles.capabilities} id="capabilities" aria-labelledby="capabilities-title">
      <header>
        <h2 id="capabilities-title">Build multi-step outcomes from registered onchain actions.</h2>
        <p>Cobia supports several execution lanes. Where a lane permits composition, solvers can combine typed actions across wallet stages; unknown assets, calls, and unsupported combinations fail closed.</p>
      </header>
      <dl>{capabilities.map(([status, title, detail]) => <div key={title}>
        <dt><span>{status}</span><strong>{title}</strong></dt>
        <dd>{detail}</dd>
      </div>)}</dl>
      <p className={styles.forecastNote}>Portfolio objectives use forecasts, not guaranteed PnL. Every executable plan remains bounded by fresh evidence and owner approval.</p>
    </section>

    <section className={styles.foundations} aria-labelledby="foundations-title">
      <header className={styles.sectionHeader}><div><h2 id="foundations-title">Why Cobia matters to X Layer.</h2></div></header>
      <div className={styles.vision}>
        <div className={styles.visionCopy}>
          <h3>Every asset, everywhere—without giving AI the keys.</h3>
          <p>X Layer is making every asset accessible. Cobia makes that future usable with AI while keeping people in control: solvers search broadly, but your limits and wallet decide exactly what moves.</p>
          <strong>Live today for X Layer swaps, Aave, and registered TSLAx acquisition, with broader asset support adopting the same owner-controlled model.</strong>
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
      <p className={styles.closeNote}><ShieldCheck aria-hidden="true" size={14} /> New capabilities stay unavailable until they pass production checks and onchain governance approval.</p>
    </section>
  </main>;
}
