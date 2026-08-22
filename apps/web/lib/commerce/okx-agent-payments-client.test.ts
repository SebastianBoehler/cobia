import { describe, expect, it, vi } from "vitest";
import { createOkxAgentPaymentsClientV1 } from "./okx-agent-payments-client";

const paymentId = "a2a_01HZX8Q9RK3JWYV7M2N5T8P4AB";

describe("OKX Agent Payments HTTP client", () => {
  it("reads only the fixed public detail and status endpoints", async () => {
    const fetcher = vi.fn().mockImplementation(async () => new Response(
      JSON.stringify({ code: "0", data: {} }),
      { status: 200, headers: { "content-type": "application/json" } },
    ));
    const client = createOkxAgentPaymentsClientV1(fetcher);

    await client.getPaymentDetail(paymentId);
    await client.getPaymentStatus(paymentId);

    expect(fetcher).toHaveBeenNthCalledWith(1,
      `https://web3.okx.com/api/v6/pay/a2a/p/${paymentId}`,
      expect.objectContaining({ method: "GET", redirect: "error", cache: "no-store" }),
    );
    expect(fetcher).toHaveBeenNthCalledWith(2,
      `https://web3.okx.com/api/v6/pay/a2a/p/${paymentId}/status`,
      expect.objectContaining({ method: "GET", redirect: "error", cache: "no-store" }),
    );
  });
});
