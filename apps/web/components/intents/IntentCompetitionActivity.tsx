import {
  CircleCheck, CircleDot, Clock3, LoaderCircle, MinusCircle, TriangleAlert,
} from "lucide-react";

export interface CompetitionSolverRun {
  solverId: string;
  displayName: string;
  revision: number;
  state: "queued" | "running" | "completed" | "abstained" | "failed";
  failureCode?: string | null;
  updatedAt: string;
}

interface ActivityProps {
  currentSolverIds: string[];
  pendingSolverIds: string[];
  runs: CompetitionSolverRun[];
}

function latestRuns(runs: CompetitionSolverRun[]) {
  const latest = new Map<string, CompetitionSolverRun>();
  for (const run of runs) {
    const stored = latest.get(run.solverId);
    if (!stored || run.revision > stored.revision) latest.set(run.solverId, run);
  }
  return [...latest.values()];
}

function readableReason(value: string) {
  const words = value.toLowerCase().split("_").map((word) => word === "okx" ? "OKX" : word);
  const label = words.join(" ");
  return `${label.charAt(0).toUpperCase()}${label.slice(1)}`;
}

function runPresentation(run: CompetitionSolverRun, verified: Set<string>, pending: Set<string>) {
  if (run.state === "queued") return { label: "Waiting to start", kind: "active", Icon: Clock3 };
  if (run.state === "running") return { label: "Building a program", kind: "active", Icon: LoaderCircle };
  if (run.state === "abstained") return { label: "No route submitted", kind: "quiet", Icon: MinusCircle };
  if (run.state === "failed") return run.failureCode === "VERIFIER_FAILED"
    ? { label: "Run could not complete", kind: "failed", Icon: TriangleAlert }
    : { label: "Proposal rejected", kind: "failed", Icon: TriangleAlert };
  if (verified.has(run.solverId)) return { label: "Verified proposal ready", kind: "verified", Icon: CircleCheck };
  if (pending.has(run.solverId)) return { label: "Awaiting verification", kind: "active", Icon: LoaderCircle };
  return { label: "Run complete", kind: "quiet", Icon: CircleCheck };
}

function progressState(index: number, activity: "open" | "working" | "verifying" | "ready") {
  const activeIndex = { open: 1, working: 1, verifying: 2, ready: 3 }[activity];
  if (index < activeIndex) return "complete";
  if (index === activeIndex) return "active";
  return "waiting";
}

export function IntentCompetitionActivity({ currentSolverIds, pendingSolverIds, runs }: ActivityProps) {
  const visibleRuns = latestRuns(runs);
  const hasWorkingRun = visibleRuns.some(({ state }) => state === "queued" || state === "running");
  const activity = currentSolverIds.length ? "ready"
    : pendingSolverIds.length ? "verifying"
      : hasWorkingRun ? "working" : "open";
  const copy = {
    open: {
      title: "Solver competition is active",
      detail: "Listening for signed proposals",
      description: "Registered solvers can build and submit a program before the deadline.",
    },
    working: {
      title: "Solvers are working",
      detail: "Programs are being built",
      description: "Each solver is independently searching within your signed guardrails.",
    },
    verifying: {
      title: "Verifier is checking proposals",
      detail: "Submitted programs are being replayed",
      description: "Only programs that reproduce the signed outcome can enter the ranking.",
    },
    ready: {
      title: "Verified proposals are ready",
      detail: "Review the ranked programs below",
      description: "Your wallet still decides whether the winning program is executed.",
    },
  }[activity];
  const busy = activity === "working" || activity === "verifying";
  const verified = new Set(currentSolverIds);
  const pending = new Set(pendingSolverIds);
  const stages = ["Intent signed", "Solvers compete", "Verifier checks", "Wallet decides"];

  return <section
    aria-busy={busy || undefined}
    aria-labelledby="solver-activity-title"
    className="solver-activity"
    data-competition-state={activity}
  >
    <p aria-live="polite" className="sr-only" role="status">{copy.title}. {copy.detail}.</p>
    <header className="solver-activity__header">
      <div className="solver-activity__signal" data-state={activity}>
        {busy ? <LoaderCircle aria-hidden="true" /> : activity === "ready"
          ? <CircleCheck aria-hidden="true" /> : <CircleDot aria-hidden="true" />}
      </div>
      <div>
        <h2 id="solver-activity-title">{copy.title}</h2>
        <p><strong>{copy.detail}.</strong> {copy.description}</p>
      </div>
      <small><Clock3 aria-hidden="true" size={14} />Checks for updates every 10 seconds</small>
    </header>

    <ol aria-label="Competition progress" className="solver-activity__progress">
      {stages.map((stage, index) => <li data-state={progressState(index, activity)} key={stage}>
        <span aria-hidden="true">{index + 1}</span><strong>{stage}</strong>
      </li>)}
    </ol>

    {visibleRuns.length ? <div className="solver-activity__runs">{visibleRuns.map((run) => {
      const presentation = runPresentation(run, verified, pending);
      const Icon = presentation.Icon;
      return <article data-run-state={run.state} data-state={presentation.kind} key={run.solverId}>
        <span className="solver-activity__run-icon"><Icon aria-hidden="true" size={18} /></span>
        <div><strong>{run.displayName}</strong><small>Revision {run.revision}</small>
          {run.state === "abstained" && run.failureCode
            ? <small>{readableReason(run.failureCode)}</small> : null}
        </div>
        <span className="solver-activity__run-state"><Icon aria-hidden="true" size={14} />{presentation.label}</span>
      </article>;
    })}</div> : <p className="solver-activity__empty">
      No solver run has started yet. The competition remains open.
    </p>}
  </section>;
}
