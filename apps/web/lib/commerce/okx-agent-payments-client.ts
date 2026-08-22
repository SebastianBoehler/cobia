import { parseOkxAgentPaymentReferenceV1, type OkxAgentPaymentsClientV1 } from "./okx-agent-payments";

type Fetcher = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

const OKX_AGENT_PAYMENTS_ORIGIN = "https://web3.okx.com";

async function readPublicEndpoint(fetcher: Fetcher, path: string): Promise<unknown> {
  const response = await fetcher(`${OKX_AGENT_PAYMENTS_ORIGIN}${path}`, {
    method: "GET",
    headers: { Accept: "application/json" },
    redirect: "error",
    cache: "no-store",
  });
  let body: unknown;
  try { body = await response.json(); } catch { throw new Error("OKX Agent Payments returned invalid JSON"); }
  if (!response.ok) throw new Error(`OKX Agent Payments returned HTTP ${response.status}`);
  return body;
}

export function createOkxAgentPaymentsClientV1(fetcher: Fetcher = fetch): OkxAgentPaymentsClientV1 {
  return {
    getPaymentDetail(paymentId) {
      const id = parseOkxAgentPaymentReferenceV1(paymentId);
      return readPublicEndpoint(fetcher, `/api/v6/pay/a2a/p/${id}`);
    },
    getPaymentStatus(paymentId) {
      const id = parseOkxAgentPaymentReferenceV1(paymentId);
      return readPublicEndpoint(fetcher, `/api/v6/pay/a2a/p/${id}/status`);
    },
  };
}
