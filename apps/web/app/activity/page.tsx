import { ActivityView } from "@/components/activity/ActivityView";
import { AppHeader } from "@/components/layout/AppHeader";
import styles from "@/components/product/ProductShell.module.css";

export default function ActivityPage() {
  return <><AppHeader /><main className={styles.page}><header className={styles.heading}><h1>Proof log</h1><p>Your signed intents, purchased route proofs, payment receipts, rehearsals, and verified execution events.</p></header><ActivityView /></main></>;
}
