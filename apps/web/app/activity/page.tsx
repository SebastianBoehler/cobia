import { ActivityView } from "@/components/activity/ActivityView";
import { AppHeader } from "@/components/layout/AppHeader";
import styles from "@/components/product/ProductShell.module.css";

export default function ActivityPage() {
  return <><AppHeader /><main className={styles.page}><header className={styles.heading}><h1>Activity</h1><p>A durable record of off-chain authorization, route purchases, simulation, and on-chain execution.</p></header><ActivityView /></main></>;
}
