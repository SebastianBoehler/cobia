import { describe, expect, it } from "vitest";
import { issueAttemptToken, verifyAttemptToken } from "./attempt-token";

const secret = "a".repeat(64);
const nowSec = 2_000_000_000;
const payload = {
  attemptId: "ce6cc33e-9726-4f9d-8ab7-a64ffac3e506",
  buyer: "0x189c40caad72812b8c6fb0df96582826b3738fa3" as const,
  expiresAt: nowSec + 240,
};

describe("mainnet execution attempt token", () => {
  it("round-trips exact bounded attempt authority", async () => {
    const token = await issueAttemptToken(payload, secret, nowSec);
    await expect(verifyAttemptToken(token, {
      attemptId: payload.attemptId,
      buyer: payload.buyer,
    }, secret, nowSec)).resolves.toEqual(payload);
  });

  it.each([
    ["attempt", { attemptId: "2f89ad1d-929a-43e0-8cbf-e87425832000" }],
    ["buyer", { buyer: "0x0000000000000000000000000000000000000001" as const }],
  ])("rejects changed expected %s", async (_label, mutation) => {
    const token = await issueAttemptToken(payload, secret, nowSec);
    await expect(verifyAttemptToken(token, {
      attemptId: payload.attemptId,
      buyer: payload.buyer,
      ...mutation,
    }, secret, nowSec))
      .rejects.toThrow("context");
  });

  it("rejects tampering, another key, expiry, and overlong tokens", async () => {
    const token = await issueAttemptToken(payload, secret, nowSec);
    const [body, mac] = token.split(".");
    await expect(verifyAttemptToken(`${body}.${mac?.replace(/^./, "A")}`, payload, secret, nowSec))
      .rejects.toThrow();
    const expected = { attemptId: payload.attemptId, buyer: payload.buyer };
    await expect(verifyAttemptToken(token, expected, "b".repeat(64), nowSec))
      .rejects.toThrow();
    await expect(verifyAttemptToken(token, expected, secret, payload.expiresAt))
      .rejects.toThrow("expired");
    await expect(issueAttemptToken({ ...payload, expiresAt: nowSec + 301 }, secret, nowSec))
      .rejects.toThrow("too long-lived");
  });
});
