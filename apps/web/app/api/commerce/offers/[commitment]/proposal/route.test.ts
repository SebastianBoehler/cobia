import { beforeEach, describe, expect, it, vi } from "vitest";

const owner = "0x1111111111111111111111111111111111111111";
const asset = "0x2222222222222222222222222222222222222222";
const mocks = vi.hoisted(() => ({
  build: vi.fn(),
  get: vi.fn(),
  getBlock: vi.fn(),
  readContract: vi.fn(),
}));

vi.mock("viem", async (load) => ({
  ...await load<typeof import("viem")>(),
  createPublicClient: vi.fn(() => ({
    getBlock: mocks.getBlock,
    readContract: mocks.readContract,
  })),
}));
vi.mock("../../../../../../lib/commerce/reference-proposal", () => ({
  buildReferenceCommerceProposalV1: mocks.build,
}));
vi.mock("../../../../../../lib/commerce/production-manifest", () => ({
  productionCommerceMerchantManifestV1: () => ({ chainId: 8453, entries: [] }),
}));
vi.mock("../../../../../../lib/env", () => ({
  readCommerceRuntimeConfig: () => ({
    BASE_RPC_URL: "https://base.example",
    XLAYER_RPC_URL: "https://xlayer.example",
    COBIA_EXECUTOR_V3_ADDRESS: "0x3333333333333333333333333333333333333333",
  }),
}));
vi.mock("../../../../../../lib/runtime/market", () => ({
  getCommerceOfferRepository: () => ({ get: mocks.get }),
}));

import { POST } from "./route";

function request() {
  return new Request("https://getcobia.com/api/commerce/offers/offer/proposal", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ owner }),
  });
}

const context = { params: Promise.resolve({ commitment: `0x${"44".repeat(32)}` }) } as never;

describe("commerce proposal API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.get.mockResolvedValue({ payment: { chainId: 8453, asset, atomicAmount: "5000" } });
    mocks.getBlock.mockResolvedValue({ number: 25_000_000n, hash: `0x${"55".repeat(32)}` });
    mocks.build.mockReturnValue({ policy: {}, program: {}, evidence: {} });
  });

  it("refuses to issue a signable proposal when the payment token balance is insufficient", async () => {
    mocks.readContract.mockResolvedValue(0n);

    const response = await POST(request(), context);

    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({
      code: "INSUFFICIENT_PAYMENT_BALANCE",
      message: "Insufficient payment-token balance on Base: 0 atomic available, 5000 required.",
    });
    expect(mocks.build).not.toHaveBeenCalled();
  });

  it("does not expose internal proposal failures", async () => {
    mocks.get.mockRejectedValue(new Error("DATABASE_URL contains secret-host"));

    const response = await POST(request(), context);

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({
      code: "PROPOSAL_UNAVAILABLE",
      message: "Commerce proposal is unavailable.",
    });
  });
});
