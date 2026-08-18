import { notFound } from "next/navigation";
import { AppHeader } from "@/components/layout/AppHeader";
import { SolverProfileView } from "@/components/solvers/SolverProfileView";
import { getSolverProfileRepository } from "@/lib/runtime/market";
import { createPageMetadata } from "../../site-metadata";

export const dynamic = "force-dynamic";
export const metadata = createPageMetadata({
  title: "Solver profile",
  description: "Inspect solver declarations separately from verifier-derived program results.",
  path: "/solvers",
});

export default async function SolverProfilePage({ params }: PageProps<"/solvers/[solverId]">) {
  const { solverId } = await params;
  const profile = await getSolverProfileRepository().read(solverId, Math.floor(Date.now() / 1_000));
  if (!profile) notFound();
  return <>
    <AppHeader />
    <main className="directory-page" id="main-content">
      <SolverProfileView profile={{
        displayName: profile.displayName,
        operatorKind: profile.operatorKind,
        attestationAddress: profile.attestationAddress,
        declaredCapabilities: profile.declaredCapabilities,
        stats: profile.stats,
        submissions: profile.submissions.map((item) => ({
          id: item.id, revision: item.revision, state: item.presentationState,
          createdAt: item.createdAt.toISOString(),
        })),
      }} />
    </main>
  </>;
}
