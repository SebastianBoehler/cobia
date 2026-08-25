import type { PortfolioSnapshot } from "../../lib/portfolio/read-portfolio";
import { PortfolioAssetMark } from "./PortfolioAssetMark";
import { formatAmount, formatCount, valueFromBalance } from "./format";
import styles from "./PortfolioView.module.css";

export function PortfolioHoldings({ snapshot }: { snapshot: PortfolioSnapshot }) {
  return <div className={styles.holdingsLayout}>
    <section className={styles.section} aria-labelledby="wallet-balances-title">
      <header className={styles.sectionHeader}><div><h2 id="wallet-balances-title">Wallet balances</h2>
        <p>Spendable assets read at block {snapshot.blockNumber}.</p></div>
        <span>{formatCount(snapshot.balances.length + 1, "asset")}</span></header>
      <ul className={styles.assetRows}>
        <li className={styles.assetRow}>
          <div className={styles.assetIdentity}><PortfolioAssetMark symbol="OKB" /><div><strong>OKB</strong>
            <small>Native gas token</small></div></div>
          <span className={styles.assetSource}>Wallet</span>
          <div className={styles.assetAmount}><strong>{formatAmount(snapshot.native.formatted)} OKB</strong>
            <small>On-chain balance</small></div>
        </li>
        {snapshot.balances.map((balance) => {
          const usdValue = valueFromBalance(balance.formatted, balance.priceUsd);
          return <li className={styles.assetRow} key={balance.address}>
            <div className={styles.assetIdentity}><PortfolioAssetMark symbol={balance.symbol} />
              <div><strong>{balance.symbol}</strong><small>Available to route</small></div></div>
            <span className={styles.assetSource} title={balance.address}>
              {balance.address.slice(0, 8)}…{balance.address.slice(-4)}</span>
            <div className={styles.assetAmount}><strong>{formatAmount(balance.formatted)} {balance.symbol}</strong>
              <small>{usdValue ?? "Price unavailable"}</small></div>
          </li>;
        })}
      </ul>
    </section>
    {snapshot.positions.length > 0 ? <section className={styles.section}
      aria-labelledby="protocol-positions-title">
      <header className={styles.sectionHeader}><div><h2 id="protocol-positions-title">Protocol positions</h2>
        <p>Supplied balances read directly from Aave V3.</p></div>
        <span>{formatCount(snapshot.positions.length, "position")}</span></header>
      <ul className={styles.assetRows}>
        {snapshot.positions.map((position) => <li className={styles.assetRow} key={position.symbol}>
          <div className={styles.assetIdentity}><PortfolioAssetMark symbol={position.symbol} />
            <div><strong>{position.symbol}</strong><small>Aave V3 supplied balance</small></div></div>
          <span className={styles.assetSource}>Aave V3</span>
          <div className={styles.assetAmount}><strong>{formatAmount(position.formatted)} {position.symbol}</strong>
            <small>On-chain position</small></div>
        </li>)}
      </ul>
    </section> : null}
  </div>;
}
