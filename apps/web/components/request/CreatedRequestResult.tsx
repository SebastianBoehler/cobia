import { ArrowRight, CircleCheck } from "lucide-react";
import Link from "next/link";

export interface CreatedRequest {
  requestId: string;
  policyHash: string;
  quoteCount: number;
  failureCount: number;
}

export function CreatedRequestResult({ created }: { created: CreatedRequest }) {
  const hasAuthorizedRoute = created.quoteCount > 0;
  const quoteLabel = `${created.quoteCount} route-authorized quote${
    created.quoteCount === 1 ? " is" : "s are"
  } ready.`;
  const failureLabel = created.failureCount === 0
    ? "No solver produced a route-authorized quote."
    : `${created.failureCount} solver attempt${created.failureCount === 1 ? "" : "s"} failed or ${
      created.failureCount === 1 ? "was" : "were"
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
          {created.failureCount > 0 ? <p>{failureLabel}</p> : null}
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
