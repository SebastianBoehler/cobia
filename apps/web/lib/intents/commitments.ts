import { commitment } from "@cobia/domain";

export function quoteSelectionCommitment(requestId: string, quoteId: string) {
  return commitment({
    action: "cobia.select-yield-quote",
    requestId,
    quoteId,
  });
}
