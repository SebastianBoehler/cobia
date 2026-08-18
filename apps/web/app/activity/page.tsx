import { ActivityView } from "@/components/activity/ActivityView";
import { AppHeader } from "@/components/layout/AppHeader";
import styles from "@/components/product/ProductShell.module.css";
import { createPageMetadata } from "../site-metadata";

export const metadata = createPageMetadata({
  title: "Proof Log",
  description: "Review signed intents and verified execution events attributed to the connected wallet.",
  path: "/activity",
  index: false,
});

export default function ActivityPage() {
  return <><AppHeader /><main className={styles.page} id="main-content"><header className={styles.heading}><h1>Activity</h1><p>A chronological wallet record of intent and execution evidence. Legacy route receipts remain archived, never presented as live programs.</p></header><ActivityView /></main></>;
}
