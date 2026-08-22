import { describe, expect, it, vi } from "vitest";
import {
  OkxAgentPaymentErrorV1,
  parseOkxAgentPaymentReferenceV1,
  readOkxAgentPaymentV1,
} from "./okx-agent-payments";

const paymentId = "a2a_01HZX8Q9RK3JWYV7M2N5T8P4AB";
const detail = {
  code: "0",
  msg: "success",
  data: {
    paymentId,
    status: "pending",
    createdAt: "2026-04-21T10:00:00Z",
    expiresAt: "2026-04-21T10:30:00Z",
    challenge: {
      type: "payment-challenge",
      data: {
        id: paymentId,
        realm: "provider.example.com",
        method: "evm",
        intent: "charge",
        request: {
          amount: "100000",
          currency: "0x779ded0c9e1022225f8e0630b35a9b54be713736",
          recipient: "0x1111111111111111111111111111111111111111",
          description: "Task #5678 direct payment",
          externalId: "task-5678",
          methodDetails: { chainId: 196, authorizationType: "eip-3009" },
        },
        expires: "2026-04-21T10:30:00Z",
      },
    },
  },
};

describe("OKX Agent Payment lookup", () => {
  it("rejects credential-bearing payment links", () => {
    expect(() => parseOkxAgentPaymentReferenceV1(
      `https://attacker:secret@pay.okx.com/p/${paymentId}`,
    )).toThrowError(new OkxAgentPaymentErrorV1(
      "INVALID_REFERENCE",
      "OKX Agent Payment reference is invalid",
    ));
  });

  it("maps the live numeric not-found envelope without querying status", async () => {
    const client = {
      getPaymentDetail: vi.fn().mockResolvedValue({
        code: 0,
        msg: "success",
        data: { available: false, challenge: null, status: null, error: "payment_not_found" },
      }),
      getPaymentStatus: vi.fn(),
    };

    await expect(readOkxAgentPaymentV1({ reference: paymentId, client })).rejects.toEqual(
      new OkxAgentPaymentErrorV1("PAYMENT_NOT_FOUND", "OKX Agent Payment was not found"),
    );
    expect(client.getPaymentStatus).not.toHaveBeenCalled();
  });

  it("returns bounded X Layer payment and settlement evidence", async () => {
    const client = {
      getPaymentDetail: vi.fn().mockResolvedValue(detail),
      getPaymentStatus: vi.fn().mockResolvedValue({
        code: "0",
        msg: "success",
        data: {
          paymentId,
          status: "completed",
          executed: {
            txHash: `0x${"ab".repeat(32)}`,
            blockNumber: 12_345_678,
            blockTimestamp: "2026-04-21T10:05:15Z",
          },
          fee: { amount: "300", bps: 30 },
        },
      }),
    };

    const result = await readOkxAgentPaymentV1({
      reference: `https://pay.okx.com/p/${paymentId}`,
      client,
    });

    expect(result).toEqual({
      provider: { id: "okx-agent-payments", displayName: "OKX Agent Payments" },
      paymentId,
      status: "completed",
      realm: "provider.example.com",
      createdAt: "2026-04-21T10:00:00Z",
      expiresAt: "2026-04-21T10:30:00Z",
      payment: {
        chainId: 196,
        atomicAmount: "100000",
        asset: "0x779ded0c9e1022225f8e0630b35a9b54be713736",
        recipient: "0x1111111111111111111111111111111111111111",
        authorizationType: "eip-3009",
      },
      settlement: {
        transactionHash: `0x${"ab".repeat(32)}`,
        blockNumber: 12_345_678,
        blockTimestamp: "2026-04-21T10:05:15Z",
        feeAtomicAmount: "300",
        feeBps: 30,
      },
      failureReason: null,
    });
    expect(result).not.toHaveProperty("description");
    expect(result).not.toHaveProperty("externalId");
  });
});
