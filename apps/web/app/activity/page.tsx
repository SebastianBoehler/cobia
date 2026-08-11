import { ActivityView } from "@/components/activity/ActivityView";
import { AppHeader } from "@/components/layout/AppHeader";
import styles from "@/components/product/ProductShell.module.css";

export default function ActivityPage() {
  return <><AppHeader /><main className={styles.page}><header className={styles.heading}><h1>Activity</h1><p>A durable record of signed policies, quote purchases, and payment receipts. Route execution and simulation are not implemented.</p></header><ActivityView /></main></>;
}
