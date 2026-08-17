import { AppHeader } from "@/components/layout/AppHeader";
import { AgentProgramView } from "@/components/agent/AgentProgramView";
import styles from "@/components/product/ProductShell.module.css";

export const dynamic = "force-dynamic";

export default async function AgentProgramPage(
  context: PageProps<"/programs/[programId]">,
) {
  const { programId } = await context.params;
  return <><AppHeader /><main className={styles.page} id="main-content">
    <header className={styles.heading}>
      <h1>Coding-agent program</h1>
      <p>Agent-authored route research, independent fork evidence, and owner-wallet execution are separate trust boundaries.</p>
    </header>
    <AgentProgramView programId={programId} />
  </main></>;
}
