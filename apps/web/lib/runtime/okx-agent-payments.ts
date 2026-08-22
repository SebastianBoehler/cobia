import { createOkxAgentPaymentsClientV1 } from "../commerce/okx-agent-payments-client";
import { readOkxAgentPaymentV1 } from "../commerce/okx-agent-payments";

const client = createOkxAgentPaymentsClientV1();

export function readProductionOkxAgentPaymentV1(reference: string) {
  return readOkxAgentPaymentV1({ reference, client });
}
