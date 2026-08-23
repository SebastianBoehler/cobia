import { stringToHex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { describe, expect, it, vi } from "vitest";
import { createWalletAuthService, type WalletAuthRepository } from "./service";

const account = privateKeyToAccount(`0x${"11".repeat(32)}`);
const stranger = privateKeyToAccount(`0x${"22".repeat(32)}`);
const nowSec = 2_000_000_000;

function repository(): WalletAuthRepository {
  const challenges = new Map<string, {
    owner: `0x${string}`; message: string; expiresAt: number; consumed: boolean;
  }>();
  const sessions = new Map<string, { owner: `0x${string}`; expiresAt: number }>();
  return {
    createChallenge: vi.fn(async (value) => { challenges.set(value.nonceHash, { ...value, consumed: false }); }),
    readChallenge: vi.fn(async ({ nonceHash, owner, nowSec: observedAt }) => {
      const challenge = challenges.get(nonceHash);
      return challenge && !challenge.consumed && challenge.owner === owner && challenge.expiresAt > observedAt
        ? challenge : null;
    }),
    consumeChallenge: vi.fn(async ({ nonceHash, owner, nowSec: observedAt }) => {
      const challenge = challenges.get(nonceHash);
      if (!challenge || challenge.consumed || challenge.owner !== owner || challenge.expiresAt <= observedAt) return null;
      challenge.consumed = true;
      return challenge;
    }),
    createSession: vi.fn(async (value) => { sessions.set(value.tokenHash, value); }),
    readSession: vi.fn(async ({ tokenHash, nowSec: observedAt }) => {
      const session = sessions.get(tokenHash);
      return session && session.expiresAt > observedAt ? session : null;
    }),
    beginCompilation: vi.fn(), completeCompilation: vi.fn(), failCompilation: vi.fn(),
    readCompletedCompilation: vi.fn(),
  };
}

describe("wallet authentication service", () => {
  it("exchanges one exact owner signature for a short-lived opaque session", async () => {
    const service = createWalletAuthService(repository(), {
      nowSec: () => nowSec,
      randomHex: vi.fn()
        .mockReturnValueOnce("aa".repeat(32))
        .mockReturnValueOnce("bb".repeat(32)),
    });
    const challenge = await service.issueChallenge({
      owner: account.address, origin: "https://getcobia.com", chainId: 196,
    });
    const signature = await account.signMessage({ message: { raw: stringToHex(challenge.message) } });
    const session = await service.authenticate({ owner: account.address,
      nonce: challenge.nonce, signature });

    expect(challenge.message).toContain("This does not authorize a transaction or publish an intent.");
    expect(session).toEqual({ token: "bb".repeat(32), owner: account.address.toLowerCase(),
      expiresAt: nowSec + 15 * 60 });
    await expect(service.readSession(session.token)).resolves.toMatchObject({ owner: account.address.toLowerCase() });
  });

  it("rejects signature mismatch, challenge replay, and expired sessions", async () => {
    let observedAt = nowSec;
    const service = createWalletAuthService(repository(), {
      nowSec: () => observedAt,
      randomHex: vi.fn()
        .mockReturnValueOnce("aa".repeat(32))
        .mockReturnValueOnce("bb".repeat(32)),
    });
    const challenge = await service.issueChallenge({
      owner: account.address, origin: "https://getcobia.com", chainId: 196,
    });
    const wrong = await stranger.signMessage({ message: challenge.message });
    await expect(service.authenticate({ owner: account.address, nonce: challenge.nonce,
      signature: wrong })).rejects.toThrow("signature");

    const signature = await account.signMessage({ message: challenge.message });
    const session = await service.authenticate({ owner: account.address,
      nonce: challenge.nonce, signature });
    await expect(service.authenticate({ owner: account.address, nonce: challenge.nonce,
      signature })).rejects.toThrow("used or expired");

    observedAt = session.expiresAt;
    await expect(service.readSession(session.token)).rejects.toThrow("session");
    await expect(service.readSession("malformed-cookie")).rejects.toThrow("session");
  });
});
