import { Challenge, Credential } from "@okxweb3/mpp";
import { describe, expect, it } from "vitest";
import { type Address, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import type { ExpectedPaymentAuthorization } from "./challenge";
import { EIP3009_AUTHORIZATION_TYPES } from "./eip3009-authorization";
import { PAYMENT_EIP712_DOMAIN } from "./support";
import { PaymentTermsSchema } from "./terms";
import { validatePaymentCredential } from "./credential";

const NOW = 1_999_999_800;
const account = privateKeyToAccount(`0x${"01".padStart(64, "0")}`);
const owner = account.address;
const solver = "0x2222222222222222222222222222222222222222";
const treasury = "0x3333333333333333333333333333333333333333";
const quoteId = `0x${"ab".repeat(32)}` as const;
const primaryNonce = `0x${"01".repeat(32)}`;
const splitNonce = `0x${"02".repeat(32)}`;
const shapedSignature = `0x${"aa".repeat(65)}`;

const terms = PaymentTermsSchema.parse({
  version: 2,
  realm: "pay.cobia.example",
  paymentChainId: 196,
  currency: "0x779ded0c9e1022225f8e0630b35a9b54be713736",
  decimals: 6,
  amount: "100000",
  recipient: solver,
  externalId: quoteId,
  feePayer: true,
  splits: [{ amount: "10000", recipient: treasury, memo: "cobia-platform" }],
  issuedAt: 1_999_999_700,
  expiresAt: 2_000_000_000,
});
const expected: ExpectedPaymentAuthorization = { terms, owner };

interface MutableAuthorization {
  type: string;
  from: string;
  to: string;
  value: string;
  validAfter: string;
  validBefore: string;
  nonce: string;
  signature: string;
  splits?: MutableSplit[];
}

type MutableSplit = Omit<MutableAuthorization, "type" | "splits">;

interface MutableCredential {
  challenge: Challenge.Challenge;
  source?: string;
  payload: { type: string; authorization?: unknown; hash?: string };
}

async function ownerSignature(value: MutableAuthorization | MutableSplit): Promise<Hex> {
  return account.signTypedData({
    domain: PAYMENT_EIP712_DOMAIN,
    types: EIP3009_AUTHORIZATION_TYPES,
    primaryType: "TransferWithAuthorization",
    message: {
      from: value.from as Address,
      to: value.to as Address,
      value: BigInt(value.value),
      validAfter: BigInt(value.validAfter),
      validBefore: BigInt(value.validBefore),
      nonce: value.nonce as Hex,
    },
  });
}

async function fixture(): Promise<MutableCredential> {
  const primary: MutableAuthorization = {
    type: "eip-3009",
    from: owner,
    to: solver,
    value: "90000",
    validAfter: "1999999740",
    validBefore: "2000000000",
    nonce: primaryNonce,
    signature: shapedSignature,
  };
  const paymentSplit: MutableSplit = {
    from: owner,
    to: treasury,
    value: "10000",
    validAfter: primary.validAfter,
    validBefore: primary.validBefore,
    nonce: splitNonce,
    signature: shapedSignature,
  };
  primary.signature = await ownerSignature(primary);
  paymentSplit.signature = await ownerSignature(paymentSplit);
  primary.splits = [paymentSplit];
  return {
    challenge: {
      id: "challenge-1",
      realm: terms.realm,
      method: "evm",
      intent: "charge",
      description: "Cobia verified solver success fee",
      expires: "2033-05-18T03:33:20.000Z",
      request: {
        amount: terms.amount,
        currency: terms.currency,
        recipient: terms.recipient,
        externalId: terms.externalId,
        methodDetails: {
          chainId: terms.paymentChainId,
          feePayer: true,
          splits: terms.splits,
        },
      },
    },
    source: `did:pkh:eip155:196:${owner}`,
    payload: {
      type: "transaction",
      authorization: primary,
    },
  };
}

function authorization(value: MutableCredential): MutableAuthorization {
  return value.payload.authorization as MutableAuthorization;
}

function split(value: MutableCredential): MutableSplit {
  const item = authorization(value).splits?.[0];
  if (!item) throw new Error("fixture split missing");
  return item;
}

async function request(mutate?: (value: MutableCredential) => void): Promise<Request> {
  const value = structuredClone(await fixture());
  mutate?.(value);
  const header = Credential.serialize(Credential.from(value));
  return new Request("https://pay.cobia.example/reveal", {
    method: "POST",
    headers: { Authorization: header },
  });
}

describe("payment credential preflight", () => {
  it("accepts the exact owner EIP-3009 credential", async () => {
    await expect(validatePaymentCredential(await request(), expected, NOW)).resolves.toMatchObject({
      owner,
      authorization: {
        type: "eip-3009",
        from: owner,
        to: solver,
        value: "90000",
        splits: [{ from: owner, to: treasury, value: "10000" }],
      },
    });
  });

  it.each([
    ["missing source", (v: MutableCredential) => { delete v.source; }],
    ["source chain", (v: MutableCredential) => { v.source = `did:pkh:eip155:1952:${owner}`; }],
    ["source owner", (v: MutableCredential) => { v.source = "did:pkh:eip155:196:0x4444444444444444444444444444444444444444"; }],
    ["hash payload", (v: MutableCredential) => { v.payload = { type: "hash", hash: quoteId }; }],
    ["Permit2", (v: MutableCredential) => { v.payload.authorization = {
      type: "permit2",
      permit: { permitted: [], nonce: "1", deadline: "2" },
      transferDetails: [],
      witness: { challengeHash: quoteId },
      signature: shapedSignature,
    }; }],
    ["delegation", (v: MutableCredential) => { v.payload.authorization = {
      type: "delegation", delegationManager: owner, permissionContexts: [], mode: "0x00",
    }; }],
    ["primary from", (v: MutableCredential) => { authorization(v).from = treasury; }],
    ["primary to", (v: MutableCredential) => { authorization(v).to = treasury; }],
    ["primary value", (v: MutableCredential) => { authorization(v).value = "90001"; }],
    ["primary validAfter", (v: MutableCredential) => { authorization(v).validAfter = "not-an-integer"; }],
    ["primary future window", (v: MutableCredential) => { authorization(v).validAfter = `${NOW + 1}`; split(v).validAfter = `${NOW + 1}`; }],
    ["primary validBefore", (v: MutableCredential) => { authorization(v).validBefore = "1999999999"; }],
    ["primary nonce", (v: MutableCredential) => { authorization(v).nonce = "0x01"; }],
    ["primary signature", (v: MutableCredential) => { authorization(v).signature = "0xaa"; }],
    ["split from", (v: MutableCredential) => { split(v).from = treasury; }],
    ["split to", (v: MutableCredential) => { split(v).to = solver; }],
    ["split value", (v: MutableCredential) => { split(v).value = "9999"; }],
    ["split validAfter", (v: MutableCredential) => { split(v).validAfter = "1999999739"; }],
    ["split validBefore", (v: MutableCredential) => { split(v).validBefore = "1999999999"; }],
    ["split nonce", (v: MutableCredential) => { split(v).nonce = "0x02"; }],
    ["split reuses primary nonce", (v: MutableCredential) => { split(v).nonce = primaryNonce; }],
    ["split signature", (v: MutableCredential) => { split(v).signature = "0xbb"; }],
    ["missing split", (v: MutableCredential) => { authorization(v).splits = []; }],
    ["extra split", (v: MutableCredential) => { authorization(v).splits?.push({ ...split(v), nonce: `0x${"03".repeat(32)}` }); }],
    ["echoed challenge", (v: MutableCredential) => { v.challenge.request.amount = "100001"; }],
  ])("rejects mutated %s", async (_name, mutate) => {
    await expect(validatePaymentCredential(await request(mutate), expected, NOW)).rejects.toThrow();
  });

  it("rejects at validBefore", async () => {
    await expect(validatePaymentCredential(await request(), expected, terms.expiresAt)).rejects.toThrow();
  });

  it("rejects a well-formed signature that was not made by the owner", async () => {
    await expect(validatePaymentCredential(await request((value) => {
      authorization(value).signature = `0x${"cc".repeat(65)}`;
    }), expected, NOW)).rejects.toThrow();
  });
});
