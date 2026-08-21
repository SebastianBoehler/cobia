import { privateKeyToAccount } from "viem/accounts";
import { describe, expect, it, vi } from "vitest";
import type { CommerceFetchV1 } from "./discovery-broker";
import {
  X402AuthorizationTemplateV1Schema,
  x402TypedDataV1,
} from "./x402-authorization";
import { executeX402ResourceV1 } from "./x402-resource-client";

const hash = (byte: string) => `0x${byte.repeat(64)}` as `0x${string}`;
const account = privateKeyToAccount(hash("1"));
const asset = "0x2222222222222222222222222222222222222222";
const payee = "0xe8067e3c72f18054de14e4950480c093156130f8";
const authorization = {
  from: account.address, to: payee, value: "10000", validAfter: "2000000070",
  validBefore: "2000000160", nonce: hash("2"),
};
const template = X402AuthorizationTemplateV1Schema.parse({
  version: 1, chainId: 196, offerCommitment: hash("3"), policyHash: hash("4"),
  programHash: hash("5"), planHash: hash("6"), endpoint: "https://api.example/resource",
  facilitator: "https://facilitator.example", resource: { url: "https://api.example/resource" },
  accepted: {
    scheme: "exact", network: "eip155:196", amount: "10000", asset, payTo: payee,
    maxTimeoutSeconds: 60,
    extra: { name: "USD Coin", version: "2" },
  },
  authorization,
  typedData: {
    domain: { name: "USD Coin", version: "2", chainId: 196, verifyingContract: asset },
    types: { TransferWithAuthorization: [
      { name: "from", type: "address" }, { name: "to", type: "address" },
      { name: "value", type: "uint256" }, { name: "validAfter", type: "uint256" },
      { name: "validBefore", type: "uint256" }, { name: "nonce", type: "bytes32" },
    ] },
    primaryType: "TransferWithAuthorization", message: authorization,
  },
});

function paymentResponse(value: unknown) {
  return Buffer.from(JSON.stringify(value), "utf8").toString("base64");
}

function paymentRequired(value: unknown) {
  return Buffer.from(JSON.stringify(value), "utf8").toString("base64");
}

const freshAccepted = {
  ...template.accepted,
  payTo: "0xe8067E3C72F18054De14E4950480c093156130f8",
};

function freshChallenge() {
  return {
    status: 402,
    headers: { "payment-required": paymentRequired({
      x402Version: 2,
      resource: { url: template.endpoint, description: "Paid result", mimeType: "application/json" },
      accepts: [freshAccepted],
    }) },
    body: Buffer.from("{}"),
  };
}

describe("x402 paid resource client", () => {
  it("sends the exact signed payload only to the registered pinned endpoint", async () => {
    const signature = await account.signTypedData(x402TypedDataV1(template));
    const fetcher = vi.fn<CommerceFetchV1>()
      .mockResolvedValueOnce(freshChallenge())
      .mockResolvedValueOnce({
        status: 200,
        headers: {
          "content-type": "application/json",
          "payment-response": paymentResponse({
            success: true, transaction: hash("7"), network: "eip155:196",
            payer: account.address, amount: "10000",
          }),
        },
        body: Buffer.from('{"result":"paid"}'),
      });
    const result = await executeX402ResourceV1({
      expected: template, submitted: template, signature,
      dnsResolver: async () => ["93.184.216.34"], fetcher,
    });
    expect(fetcher).toHaveBeenNthCalledWith(2, expect.objectContaining({
      url: "https://api.example/resource", resolvedAddress: "93.184.216.34",
      headers: expect.objectContaining({
        accept: "application/json", "payment-signature": expect.any(String),
      }),
    }));
    const sent = JSON.parse(Buffer.from(
      fetcher.mock.calls[1]![0].headers["payment-signature"]!, "base64",
    ).toString("utf8"));
    expect(sent.accepted).toEqual(freshAccepted);
    expect(fetcher.mock.calls[1]![0].headers).not.toHaveProperty("authorization");
    expect(result.settlement).toMatchObject({
      success: true, network: "eip155:196", payer: account.address.toLowerCase(), amount: "10000",
    });
    expect(Buffer.from(result.resourceBody).toString("utf8")).toBe('{"result":"paid"}');
  });

  it("never forwards an authorization across redirects or private DNS", async () => {
    const signature = await account.signTypedData(x402TypedDataV1(template));
    const redirect = vi.fn<CommerceFetchV1>().mockResolvedValue({
      status: 302, headers: { location: "https://other.example/steal" }, body: new Uint8Array(),
    });
    await expect(executeX402ResourceV1({
      expected: template, submitted: template, signature,
      dnsResolver: async () => ["93.184.216.34"], fetcher: redirect,
    })).rejects.toThrow("redirect");
    expect(redirect).toHaveBeenCalledTimes(1);
    await expect(executeX402ResourceV1({
      expected: template, submitted: template, signature,
      dnsResolver: async () => ["127.0.0.1"], fetcher: vi.fn(),
    })).rejects.toThrow(/blocked/i);
  });

  it("rejects missing or mismatched settlement evidence", async () => {
    const signature = await account.signTypedData(x402TypedDataV1(template));
    const cases = [
      undefined,
      paymentResponse({ success: true, transaction: hash("7"), network: "eip155:1", payer: account.address }),
      paymentResponse({ success: true, transaction: hash("7"), network: "eip155:196", payer: payee }),
      paymentResponse({ success: true, transaction: hash("7"), network: "eip155:196", payer: account.address, amount: "9999" }),
    ];
    for (const header of cases) {
      let requestCount = 0;
      await expect(executeX402ResourceV1({
        expected: template, submitted: template, signature,
        dnsResolver: async () => ["93.184.216.34"],
        fetcher: async () => requestCount++ === 0 ? freshChallenge() : ({
          status: 200,
          headers: header ? { "payment-response": header } : {} as Record<string, string>,
          body: new Uint8Array(),
        }),
      })).rejects.toThrow(/settlement/i);
    }
  });
});
