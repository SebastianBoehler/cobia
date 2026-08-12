import { describe, expect, it } from "vitest";
import { parsePaymentReceiptHeader } from "./receipt";

const lowerReference = `0x${"ab".repeat(32)}`;
const mixedReference = `0x${"aB".repeat(32)}`;
const lowerExternalId = `0x${"cd".repeat(32)}`;
const mixedExternalId = `0x${"cD".repeat(32)}`;

function header(overrides: Record<string, unknown> = {}): string {
  return Buffer.from(JSON.stringify({
    method: "evm",
    reference: lowerReference,
    status: "success",
    timestamp: "2033-05-18T03:30:00.000Z",
    chainId: 196,
    challengeId: "challenge-1",
    externalId: lowerExternalId,
    ...overrides,
  })).toString("base64url");
}

describe("EVM payment receipt parsing", () => {
  it("normalizes byte identifiers before replay comparison", () => {
    expect(parsePaymentReceiptHeader(header({
      reference: mixedReference,
      externalId: mixedExternalId,
    }))).toMatchObject({
      reference: lowerReference,
      externalId: lowerExternalId,
    });
  });

  it("keeps a historical testnet receipt readable", () => {
    expect(parsePaymentReceiptHeader(header({ chainId: 1952 })).chainId).toBe(1952);
  });

  it.each([
    ["challengeId", { challengeId: undefined }],
    ["externalId", { externalId: undefined }],
  ])("rejects a receipt without %s correlation", (_field, override) => {
    expect(() => parsePaymentReceiptHeader(header(override))).toThrow();
  });
});
