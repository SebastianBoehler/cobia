import { AppHeader } from "@/components/layout/AppHeader";
import { SolverDirectory } from "@/components/solvers/SolverDirectory";
import { getSolverProfileRepository } from "@/lib/runtime/market";
import { currentUnixSeconds } from "@/lib/time";
import { createPageMetadata } from "../site-metadata";

export const dynamic = "force-dynamic";
export const metadata = createPageMetadata({
  title: "Solvers",
  description: "Inspect solver identity claims separately from independently derived program results.",
  path: "/solvers",
});

export default async function SolversPage() {
  const rows = await getSolverProfileRepository().list(currentUnixSeconds());
  const solvers = rows.filter((row) => row !== null).map((row) => ({
    id: row.id, displayName: row.displayName, operatorKind: row.operatorKind,
    declaredCapabilities: row.declaredCapabilities, stats: row.stats,
  }));
  return (
    <>
      <AppHeader />
      <main className="directory-page" id="main-content">
        <header className="directory-page__header"><h1>Solvers</h1><p>Identity and capability claims are declared. Results are derived from immutable verifier evidence.</p></header>
        <SolverDirectory solvers={solvers} />
      </main>
    </>
  );
}
