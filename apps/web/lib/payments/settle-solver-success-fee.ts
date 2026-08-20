import { SaApiClient } from "@okxweb3/mpp/evm";
import { readOkxCredentials } from "../env";
import type { createSolverSuccessFeeRepository } from "../db/solver-success-fees";

type Repository = ReturnType<typeof createSolverSuccessFeeRepository>;

export async function settleSolverSuccessFee(input: {
  submissionId: string; repository: Repository; nowSec: number;
  settle?: SaApiClient["chargeSettle"];
}) {
  const authorization = await input.repository.claimSettlement(input.submissionId, input.nowSec);
  if (authorization.state === "settled" || authorization.state === "expired") {
    return { state: authorization.state, settlement: authorization.settlement };
  }
  const client = input.settle ? undefined : new SaApiClient(readOkxCredentials());
  const settle = input.settle ?? client!.chargeSettle.bind(client);
  try {
    const settlement = await settle(authorization.credential as Parameters<SaApiClient["chargeSettle"]>[0]);
    await input.repository.settle(input.submissionId, settlement);
    return { state: "settled" as const, settlement };
  } catch {
    await input.repository.markUncertain(input.submissionId, "SETTLEMENT_UNCERTAIN");
    return { state: "uncertain" as const, settlement: null };
  }
}
