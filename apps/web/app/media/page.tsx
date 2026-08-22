import { ArrowUpRight, Download, Film, ImageIcon, ShieldCheck } from "lucide-react";
import Image from "next/image";
import { AppHeader } from "../../components/layout/AppHeader";
import { createPageMetadata } from "../site-metadata";
import styles from "./media.module.css";

export const metadata = createPageMetadata({
  title: "Media kit",
  description: "Download approved Cobia logos, social assets, product imagery and verified-intent proof media.",
  path: "/media",
});

const brandAssets = [
  { href: "/media/cobia-mark-cobalt.svg", label: "Route mark", meta: "SVG · transparent" },
  { href: "/media/cobia-wordmark-dark.svg", label: "Dark wordmark", meta: "SVG · transparent" },
  { href: "/media/cobia-wordmark-light.svg", label: "Light wordmark", meta: "SVG · transparent" },
  { href: "/media/cobia-wordmark-dark.png", label: "Wordmark lockup", meta: "PNG · transparent" },
  { href: "/media/cobia-x-avatar.png", label: "X avatar", meta: "PNG · 800 × 800" },
  { href: "/media/cobia-x-banner.png", label: "X banner", meta: "PNG · 1500 × 500" },
] as const;

const officialLinks = [
  { href: "https://getcobia.com", label: "Product" },
  { href: "https://github.com/SebastianBoehler/cobia", label: "GitHub" },
  { href: "https://x.com/Cobia_Web3", label: "X · @Cobia_Web3" },
] as const;

export default function MediaKitPage() {
  return <>
    <AppHeader />
    <main className={styles.page} id="main-content">
      <section className={styles.hero}>
        <div className={styles.heroCopy}>
          <span>Official assets</span>
          <h1>Cobia media kit</h1>
          <p>Approved identity, product proof, and company language for partners, builders, hackathons, and press.</p>
          <div className={styles.heroActions}>
            <a className="button button--primary" download href="/media/cobia-wordmark-dark.svg"><Download aria-hidden="true" size={17} />Download wordmark</a>
            <a className="text-link" href="#proof">View product proof</a>
          </div>
        </div>
        <div aria-hidden="true" className={styles.routeVisual}>
          <Image alt="" height={512} src="/media/cobia-mark-cobalt.svg" width={512} />
          <span /><span /><span />
        </div>
      </section>

      <section className={styles.section} aria-labelledby="brand-assets">
        <header className={styles.sectionHeader}>
          <div><ImageIcon aria-hidden="true" size={20} /><span>Identity</span></div>
          <h2 id="brand-assets">Brand assets</h2>
          <p>Use the route-node symbol and COBIA wordmark without recoloring, distortion, or decorative effects.</p>
        </header>
        <div className={styles.logoPreview}>
          <div><Image alt="Cobia dark wordmark" height={240} src="/media/cobia-wordmark-dark.svg" width={960} /></div>
          <div className={styles.logoPreviewDark}><Image alt="Cobia light wordmark" height={240} src="/media/cobia-wordmark-light.svg" width={960} /></div>
        </div>
        <div className={styles.downloadList}>
          {brandAssets.map((asset) => <a download href={asset.href} key={asset.href}>
            <span><strong>{asset.label}</strong><small>{asset.meta}</small></span>
            <Download aria-hidden="true" size={18} />
          </a>)}
        </div>
      </section>

      <section className={`${styles.section} ${styles.proof}`} id="proof" aria-labelledby="product-proof">
        <header className={styles.sectionHeader}>
          <div><Film aria-hidden="true" size={20} /><span>Motion</span></div>
          <h2 id="product-proof">Product proof</h2>
          <p>One intent, competing solvers, exact verification, wallet-authorized execution, and a public X Layer receipt.</p>
        </header>
        <video controls playsInline poster="/media/cobia-intent-proof-poster.jpg" preload="metadata">
          <source src="/media/cobia-intent-proof-x-layer.mp4" type="video/mp4" />
        </video>
        <div className={styles.proofActions}>
          <a className="button button--quiet" download href="/media/cobia-intent-proof-x-layer.mp4"><Download aria-hidden="true" size={17} />Download 16:9 video</a>
          <a className="button button--quiet" download href="/media/cobia-mainnet-outcome.jpg"><Download aria-hidden="true" size={17} />Download outcome image</a>
        </div>
      </section>

      <section className={`${styles.section} ${styles.company}`} aria-labelledby="company-copy">
        <header className={styles.sectionHeader}>
          <div><ShieldCheck aria-hidden="true" size={20} /><span>Company</span></div>
          <h2 id="company-copy">Company boilerplate</h2>
        </header>
        <blockquote>“State the outcome. Keep the keys.”</blockquote>
        <p>Cobia is a verified intent system on X Layer. Owners describe bounded outcomes, solvers compete to produce executable programs, and Cobia independently checks exact calls against the signed policy before the owner wallet approves execution.</p>
        <aside>
          <strong>Usage</strong>
          <span>Keep clear space around the mark.</span>
          <span>Use cobalt only as the brand accent.</span>
          <span>Do not use a literal fish or imply autonomous custody.</span>
        </aside>
      </section>

      <nav className={styles.officialLinks} aria-label="Official Cobia links">
        {officialLinks.map((link) => <a href={link.href} key={link.href} rel="noreferrer" target="_blank"><span>{link.label}</span><ArrowUpRight aria-hidden="true" size={18} /></a>)}
      </nav>
    </main>
  </>;
}
