import { AppHeader } from "../../components/layout/AppHeader";
import { NetworkOverview } from "../../components/network/NetworkOverview";
import { getNetworkOutcomeRepository, getSolverProfileRepository } from "../../lib/runtime/market";
import { createPageMetadata } from "../site-metadata";

export const dynamic = "force-dynamic";
export const metadata = createPageMetadata({
  title: "Cobia Network",
  description: "Inspect confirmed X Layer outcomes, verified volume and evidence-backed solver performance.",
  path: "/network",
});

export default async function NetworkPage() {
  const observedAtSec = Math.floor(Date.now() / 1_000);
  const [report, profiles] = await Promise.allSettled([
    getNetworkOutcomeRepository().read({
      window: "30d", limit: 20, cursor: null, observedAtSec,
    }),
    getSolverProfileRepository().list(observedAtSec),
  ]);
  const solvers = profiles.status === "fulfilled" ? profiles.value.flatMap((profile) => profile ? [{
    id: profile.id,
    displayName: profile.displayName,
    stats: profile.stats,
  }] : []) : [];
  return <><AppHeader /><NetworkOverview
    report={report.status === "fulfilled" ? report.value : null}
    solvers={solvers}
  /></>;
}
