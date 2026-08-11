import { createPublicClient, http } from "viem";
import { xLayer } from "../chain/xlayer";
import { readExecutionSessionSecret, readMarketConfig } from "../env";
import { createExecutionService } from "../execution-v2/execution-service";
import { createExecutionReadClientV2 } from "../execution-v2/viem-client";
import { readPaymentTermsConfig } from "../payments/config";
import {
  getExecutionRepository,
  getPurchaseRepository,
  getRehearsalRepository,
  getRequestRepository,
} from "./market";
import { trustedRouteSolverAddress } from "./solver-registry";

let service: ReturnType<typeof createExecutionService> | undefined;

export function getExecutionService() {
  if (service) return service;
  const rpcUrl = readMarketConfig().XLAYER_RPC_URL;
  const client = createPublicClient({
    chain: xLayer,
    transport: http(rpcUrl, { timeout: 15_000 }),
  });
  service = createExecutionService({
    purchases: getPurchaseRepository(),
    requests: getRequestRepository(),
    rehearsals: getRehearsalRepository(),
    executions: getExecutionRepository(),
    readClient: createExecutionReadClientV2(client),
    realm: readPaymentTermsConfig().PAYMENT_REALM,
    sessionSecret: readExecutionSessionSecret(),
    trustedSolverAddress: trustedRouteSolverAddress,
    nowSec: () => Math.floor(Date.now() / 1_000),
  });
  return service;
}
