import { ArrowRight, CircleCheck } from "lucide-react";
import Link from "next/link";

export interface CreatedRequest {
  requestId: string;
  policyHash: string;
  quoteCount?: number;
  failureCount?: number;
  agentProgramId?: string;
}

export function CreatedRequestResult({ created }: { created: CreatedRequest }) {
  if (created.agentProgramId) return (
    <section className="request-created" aria-live="polite">
      <CircleCheck aria-hidden="true" size={26} />
      <div>
        <h2>Coding-agent program verified</h2>
        <p>The isolated agent authored a program and the independent verifier reproduced its evidence on a fresh X Layer fork.</p>
        <p>Your principal has not moved. Execution is a separate wallet-confirmed transaction on X Layer mainnet.</p>
      </div>
      <code>{created.policyHash}</code>
      <Link className="button button--primary" href={`/programs/${created.agentProgramId}`}>
        Review verified program
        <ArrowRight aria-hidden="true" size={17} />
      </Link>
    </section>
  );
  const quoteCount = created.quoteCount ?? 0;
  const failureCount = created.failureCount ?? 0;
  const hasAuthorizedRoute = quoteCount > 0;
  const quoteLabel = `${quoteCount} route-authorized quote${
    quoteCount === 1 ? " is" : "s are"
  } ready.`;
  const failureLabel = failureCount === 0
    ? "No solver produced a route-authorized quote."
    : `${failureCount} solver attempt${failureCount === 1 ? "" : "s"} failed or ${
      failureCount === 1 ? "was" : "were"
    } rejected.`;
  return (
    <section className="request-created" aria-live="polite">
      <CircleCheck aria-hidden="true" size={26} />
      <div>
        <h2>{hasAuthorizedRoute
          ? "Solver market complete"
          : "Request completed without an authorized route"}</h2>
        {hasAuthorizedRoute ? <>
          <p>{quoteLabel}</p>
          {failureCount > 0 ? <p>{failureLabel}</p> : null}
          <p>Your principal has not moved.</p>
        </> : <p>{failureLabel}</p>}
      </div>
      <code>{created.policyHash}</code>
      <Link className="button button--primary" href={`/requests/${created.requestId}`}>
        {hasAuthorizedRoute ? "Review solver quotes" : "Review request"}
        <ArrowRight aria-hidden="true" size={17} />
      </Link>
    </section>
  );
}
