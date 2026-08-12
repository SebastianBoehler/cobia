import { eq } from "drizzle-orm";
import {
  isActiveRequestState,
  visibleRequestQuotes,
} from "../markets/active-quotes";
import { projectPublicRouteSummaryV2 } from "../markets/route-summary";
import type { CobiaDatabase } from "./client";
import {
  parsePersistedPolicy,
  parsePersistedSnapshot,
  parsePublicPersistedQuote,
  validatePersistedRoundArtifacts,
} from "./persisted-round";
import { cobiaQuotes, cobiaRequests, cobiaRoutePurchases } from "./schema";

export async function readPublicRequest(
  db: CobiaDatabase,
  requestId: string,
  nowSec: number,
) {
  const request = await db.query.cobiaRequests.findFirst({
    where: eq(cobiaRequests.id, requestId),
  });
  if (!request) return undefined;
  const purchase = ["paid", "revealed", "executed"].includes(request.state)
    ? await db.query.cobiaRoutePurchases.findFirst({
        columns: { id: true },
        where: eq(cobiaRoutePurchases.requestId, requestId),
      })
    : undefined;
  const storedQuotes = await db.query.cobiaQuotes.findMany({
    columns: {
      executable: true,
      privateBundle: true,
      publicQuote: true,
      verdict: true,
    },
    where: eq(cobiaQuotes.requestId, requestId),
  });
  const policy = parsePersistedPolicy(request.policy);
  const snapshot = request.snapshot ? parsePersistedSnapshot(request.snapshot) : null;
  const visibleArtifacts = storedQuotes
    .filter(({ executable }) => !isActiveRequestState(request.state) || executable)
    .map((storedQuote) => {
      const quote = parsePublicPersistedQuote(storedQuote.publicQuote);
      if (!snapshot) return { quote, summary: null };
      const artifacts = validatePersistedRoundArtifacts({
        requestId,
        storedPolicy: policy,
        storedPolicyHash: request.policyHash,
        storedSnapshot: snapshot,
        bundleInput: storedQuote.privateBundle,
        verdictInput: storedQuote.verdict,
        quoteInput: quote,
      });
      return {
        quote,
        summary: artifacts.version === 2
          ? projectPublicRouteSummaryV2(artifacts.bundle)
          : null,
      };
    });
  const quotes = visibleRequestQuotes({
    state: request.state,
    selectedQuoteId: request.selectedQuoteId,
    quotes: visibleArtifacts.map(({ quote }) => quote),
  }, nowSec);
  const visibleIds = new Set(quotes.map(({ quoteId }) => quoteId));
  const routeSummaries = Object.fromEntries(visibleArtifacts.flatMap(({ quote, summary }) =>
    summary && visibleIds.has(quote.quoteId) ? [[quote.quoteId, summary]] : []));
  return {
    requestId: request.id,
    state: request.state,
    policy,
    snapshot,
    selectedQuoteId: request.selectedQuoteId,
    purchasedRouteId: purchase?.id ?? (
      ["revealed", "executed"].includes(request.state) ? request.selectedQuoteId : null
    ),
    quotes,
    routeSummaries,
  };
}
