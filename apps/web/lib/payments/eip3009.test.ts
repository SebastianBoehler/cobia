import { Challenge, Credential } from "@okxweb3/mpp";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { encodeFunctionResult } from "viem";
import { authorizePayment } from "./eip3009";
import { buildPaymentTerms, paymentTermsToChargeOptions } from "./terms";

const owner = "0x1111111111111111111111111111111111111111";
const other = "0x4444444444444444444444444444444444444444";
const paymentAsset = "0x779Ded0c9e1022225f8E0630b35a9b54bE713736";
const mainnetDomainSeparator = "0xd591d9baf744328d9400b923cb02c9474d367d591ca1ab24d8c4068be527599d";
const solver = "0x2222222222222222222222222222222222222222";
const treasury = "0x3333333333333333333333333333333333333333";
const signature = `0x${"ef".repeat(65)}`;
const issuedAt = 2_000_000_000;

const terms = buildPaymentTerms({
  quote: { quoteId: `0x${"ab".repeat(32)}`, priceAtomic: "100000" },
  solver,
  treasury,
  realm: "pay.cobia.example",
  issuedAt,
  cutoff: issuedAt + 300,
});

const domainAbi = [{
  type: "function",
  name: "eip712Domain",
  stateMutability: "view",
  inputs: [],
  outputs: [
    { name: "fields", type: "bytes1" },
    { name: "name", type: "string" },
    { name: "version", type: "string" },
    { name: "chainId", type: "uint256" },
    { name: "verifyingContract", type: "address" },
    { name: "salt", type: "bytes32" },
    { name: "extensions", type: "uint256[]" },
  ],
}] as const;

type ChallengeValue = Parameters<typeof Challenge.serialize>[0];

function challengeResponse(mutate?: (value: ChallengeValue) => void): Response {
  const options = paymentTermsToChargeOptions(terms);
  const value: ChallengeValue = {
    id: "challenge-1",
    realm: terms.realm,
    method: "evm",
    intent: "charge",
    description: options.description,
    expires: options.expires,
    request: {
      amount: options.amount,
      currency: options.currency,
      recipient: options.recipient,
      externalId: options.externalId,
      methodDetails: structuredClone(options.methodDetails),
    },
  };
  mutate?.(value);
  return new Response(null, {
    status: 402,
    headers: { "WWW-Authenticate": Challenge.serialize(value) },
  });
}

type DomainResult = Parameters<typeof encodeFunctionResult<typeof domainAbi, "eip712Domain">>[0]["result"];

function harness(
  account: `0x${string}` = owner,
  domainResult: DomainResult = [
    "0x0f", "USD₮0", "1", 196n, paymentAsset, `0x${"00".repeat(32)}`, [],
  ],
) {
  const request = vi.fn(async ({ method }: { method: string }) => {
    if (method === "eth_signTypedData_v4") return signature;
    throw new Error(`Unexpected wallet method ${method}`);
  });
  const switchChain = vi.fn().mockResolvedValue(undefined);
  const chainRequest = vi.fn(async () => encodeFunctionResult({
    abi: domainAbi,
    functionName: "eip712Domain",
    result: domainResult,
  }));
  return {
    wallet: { account, request, switchChain },
    reader: { request: chainRequest },
    request,
    switchChain,
    chainRequest,
  };
}

function mutateRequest(
  mutate: (request: Record<string, unknown>) => void,
): (value: ChallengeValue) => void {
  return (value) => mutate(value.request as Record<string, unknown>);
}

describe("authorizePayment", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(issuedAt * 1_000);
  });
  afterEach(() => vi.useRealTimers());

  it("validates exact terms before signing the primary and split authorizations", async () => {
    const test = harness();
    const authorization = await authorizePayment(
      challengeResponse(),
      test.wallet,
      { terms, owner },
      test.reader,
    );

    const credential = Credential.deserialize(authorization);
    expect(credential.source).toBe(`did:pkh:eip155:196:${owner}`);
    expect(credential.payload).toMatchObject({
      type: "transaction",
      authorization: {
        from: owner,
        to: solver,
        value: "90000",
        validBefore: String(terms.expiresAt),
        splits: [{ from: owner, to: treasury, value: "10000", validBefore: String(terms.expiresAt) }],
      },
    });
    const payload = credential.payload as {
      authorization: { validAfter: string; splits: Array<{ validAfter: string }> };
    };
    expect(payload.authorization.splits[0]?.validAfter).toBe(payload.authorization.validAfter);
    expect(test.switchChain).toHaveBeenCalledWith(196);
    expect(test.chainRequest).toHaveBeenCalledTimes(1);
    expect(test.request).toHaveBeenCalledTimes(2);
  });

  it("uses the exact on-chain domain separator when ERC-5267 metadata is unavailable", async () => {
    const test = harness();
    test.chainRequest.mockRejectedValueOnce(new Error("execution reverted"));
    test.chainRequest.mockResolvedValueOnce(mainnetDomainSeparator);

    await authorizePayment(challengeResponse(), test.wallet, { terms, owner }, test.reader);

    expect(test.chainRequest).toHaveBeenCalledTimes(2);
    expect(test.request).toHaveBeenCalledTimes(2);
  });

  it("fails closed when independent expected terms are not supplied", async () => {
    const test = harness();
    await expect(authorizePayment(challengeResponse(), test.wallet))
      .rejects.toThrow("Expected payment terms are required");
    expect(test.switchChain).not.toHaveBeenCalled();
    expect(test.chainRequest).not.toHaveBeenCalled();
    expect(test.request).not.toHaveBeenCalled();
  });

  it("rejects a wallet other than the policy owner before side effects", async () => {
    const test = harness(other);
    await expect(authorizePayment(
      challengeResponse(),
      test.wallet,
      { terms, owner },
      test.reader,
    )).rejects.toThrow("policy owner");
    expect(test.switchChain).not.toHaveBeenCalled();
    expect(test.chainRequest).not.toHaveBeenCalled();
    expect(test.request).not.toHaveBeenCalled();
  });

  it.each([
    ["wrong domain name", [
      "0x0f", "Imposter", "1", 196n, paymentAsset, `0x${"00".repeat(32)}`, [],
    ]],
    ["wrong domain version", [
      "0x0f", "USD₮0", "2", 196n, paymentAsset, `0x${"00".repeat(32)}`, [],
    ]],
    ["salt-bearing domain", [
      "0x1f", "USD₮0", "1", 196n, paymentAsset, `0x${"01".repeat(32)}`, [],
    ]],
    ["domain extensions", [
      "0x0f", "USD₮0", "1", 196n, paymentAsset, `0x${"00".repeat(32)}`, [1n],
    ]],
    ["wrong domain chain", [
      "0x0f", "USD₮0", "1", 1952n, paymentAsset, `0x${"00".repeat(32)}`, [],
    ]],
    ["wrong verifying contract", [
      "0x0f", "USD₮0", "1", 196n, other, `0x${"00".repeat(32)}`, [],
    ]],
  ] as const)("rejects a %s before requesting a signature", async (_name, domainResult) => {
    const test = harness(owner, [...domainResult] as DomainResult);
    await expect(authorizePayment(
      challengeResponse(),
      test.wallet,
      { terms, owner },
      test.reader,
    )).rejects.toThrow();
    expect(test.request).not.toHaveBeenCalled();
  });

  const mutations: Array<[string, (value: ChallengeValue) => void]> = [
    ["method", (value) => { value.method = "tempo"; }],
    ["intent", (value) => { value.intent = "session"; }],
    ["realm", (value) => { value.realm = "attacker.example"; }],
    ["description", (value) => { value.description = "Other purchase"; }],
    ["amount", mutateRequest((request) => { request.amount = "100001"; })],
    ["currency", mutateRequest((request) => { request.currency = other; })],
    ["recipient", mutateRequest((request) => { request.recipient = other; })],
    ["external id", mutateRequest((request) => { request.externalId = `0x${"cd".repeat(32)}`; })],
    ["chain", mutateRequest((request) => {
      (request.methodDetails as Record<string, unknown>).chainId = 1952;
    })],
    ["fee payer", mutateRequest((request) => {
      (request.methodDetails as Record<string, unknown>).feePayer = false;
    })],
    ["Permit2", mutateRequest((request) => {
      (request.methodDetails as Record<string, unknown>).permit2Address = other;
    })],
    ["split amount", mutateRequest((request) => {
      ((request.methodDetails as { splits: Array<Record<string, unknown>> }).splits[0]!).amount = "9999";
    })],
    ["split recipient", mutateRequest((request) => {
      ((request.methodDetails as { splits: Array<Record<string, unknown>> }).splits[0]!).recipient = other;
    })],
    ["split memo", mutateRequest((request) => {
      ((request.methodDetails as { splits: Array<Record<string, unknown>> }).splits[0]!).memo = "other";
    })],
    ["split count", mutateRequest((request) => {
      (request.methodDetails as Record<string, unknown>).splits = [];
    })],
    ["missing expiry", (value) => { delete value.expires; }],
    ["mismatched expiry", (value) => {
      value.expires = new Date((terms.expiresAt - 1) * 1_000).toISOString();
    }],
  ];

  it.each(mutations)("rejects a mutated %s before any wallet or RPC side effect", async (_name, mutate) => {
    const test = harness();
    await expect(authorizePayment(
      challengeResponse(mutate),
      test.wallet,
      { terms, owner },
      test.reader,
    )).rejects.toThrow();
    expect(test.switchChain).not.toHaveBeenCalled();
    expect(test.chainRequest).not.toHaveBeenCalled();
    expect(test.request).not.toHaveBeenCalled();
  });
});
