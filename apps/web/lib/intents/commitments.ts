import { commitment } from "@cobia/domain";

export function quoteSelectionCommitment(requestId: string, quoteId: string) {
  return commitment({
    action: "cobia.select-yield-quote",
    requestId,
    quoteId,
  });
}

export function routeAccessCommitment(routeId: string, buyer: string, timestamp: number) {
  return commitment({ action: "cobia.access-purchased-route", routeId, buyer: buyer.toLowerCase(), timestamp });
}
