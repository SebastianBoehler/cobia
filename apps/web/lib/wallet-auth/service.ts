import { createHash, randomBytes } from "node:crypto";
import { getAddress, isAddressEqual, recoverMessageAddress, type Address, type Hex } from "viem";
import { z } from "zod";

const CHALLENGE_LIFETIME_SEC = 5 * 60;
export const WALLET_SESSION_LIFETIME_SEC = 15 * 60;
export const WALLET_SESSION_COOKIE = "cobia_wallet_session";

export class WalletAuthenticationRejectedError extends Error {}
export class WalletSessionRejectedError extends Error {}

const OwnerSchema = z.string().refine((value) => /^0x[0-9a-fA-F]{40}$/.test(value))
  .transform((value) => getAddress(value).toLowerCase() as Address);
const NonceSchema = z.string().regex(/^[0-9a-f]{64}$/);
const SignatureSchema = z.string().regex(/^0x[0-9a-fA-F]{130}$/).transform((value) => value as Hex);

interface ChallengeRecord {
  owner: Address;
  message: string;
  expiresAt: number;
}

interface SessionRecord {
  owner: Address;
  expiresAt: number;
}

export type CompilationAdmission =
  | { kind: "run"; id: string }
  | { kind: "cached"; result: unknown }
  | { kind: "limited" }
  | { kind: "busy" };

export interface WalletAuthRepository {
  createChallenge(value: ChallengeRecord & { nonceHash: string }): Promise<void>;
  readChallenge(value: { nonceHash: string; owner: Address; nowSec: number }): Promise<ChallengeRecord | null>;
  consumeChallenge(value: { nonceHash: string; owner: Address; nowSec: number }): Promise<ChallengeRecord | null>;
  createSession(value: SessionRecord & { tokenHash: string }): Promise<void>;
  readSession(value: { tokenHash: string; nowSec: number }): Promise<SessionRecord | null>;
  beginCompilation(value: { owner: Address; clientKey: string; goalHash: string;
    actionPreference: string; nowSec: number }): Promise<CompilationAdmission>;
  completeCompilation(id: string, result: unknown, nowSec: number): Promise<void>;
  failCompilation(id: string, nowSec: number): Promise<void>;
}

function digest(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function authenticationMessage(input: {
  owner: Address; origin: string; chainId: number; nonce: string; issuedAt: number; expiresAt: number;
}): string {
  const url = new URL(input.origin);
  if (url.origin !== input.origin || !["http:", "https:"].includes(url.protocol)) {
    throw new Error("Wallet authentication origin is invalid");
  }
  return `${url.host} wants you to sign in with your Ethereum account:\n${input.owner}\n\n` +
    "Authorize bounded Cobia intent compilation. This does not authorize a transaction or publish an intent.\n\n" +
    `URI: ${url.origin}/intents/new\nVersion: 1\nChain ID: ${input.chainId}\nNonce: ${input.nonce}\n` +
    `Issued At: ${new Date(input.issuedAt * 1_000).toISOString()}\n` +
    `Expiration Time: ${new Date(input.expiresAt * 1_000).toISOString()}`;
}

export function createWalletAuthService(repository: WalletAuthRepository, dependencies: {
  nowSec?: () => number;
  randomHex?: () => string;
} = {}) {
  const now = dependencies.nowSec ?? (() => Math.floor(Date.now() / 1_000));
  const randomHex = dependencies.randomHex ?? (() => randomBytes(32).toString("hex"));

  return {
    async issueChallenge(raw: { owner: string; origin: string; chainId: number }) {
      const owner = OwnerSchema.parse(raw.owner);
      const chainId = z.number().int().positive().safe().parse(raw.chainId);
      const issuedAt = now();
      const expiresAt = issuedAt + CHALLENGE_LIFETIME_SEC;
      const nonce = NonceSchema.parse(randomHex());
      const message = authenticationMessage({ owner, origin: raw.origin, chainId, nonce, issuedAt, expiresAt });
      await repository.createChallenge({ nonceHash: digest(nonce), owner, message, expiresAt });
      return { nonce, message, expiresAt };
    },

    async authenticate(raw: { owner: string; nonce: string; signature: string }) {
      const owner = OwnerSchema.parse(raw.owner);
      const nonce = NonceSchema.parse(raw.nonce);
      const signature = SignatureSchema.parse(raw.signature);
      const nonceHash = digest(nonce);
      const observedAt = now();
      const challenge = await repository.readChallenge({ nonceHash, owner, nowSec: observedAt });
      if (!challenge) throw new WalletAuthenticationRejectedError(
        "Wallet authentication challenge was already used or expired",
      );
      let signer: Address;
      try {
        signer = await recoverMessageAddress({ message: challenge.message, signature });
      } catch {
        throw new WalletAuthenticationRejectedError("Wallet authentication signature is invalid");
      }
      if (!isAddressEqual(signer, owner)) {
        throw new WalletAuthenticationRejectedError("Wallet authentication signature is invalid");
      }
      if (!await repository.consumeChallenge({ nonceHash, owner, nowSec: observedAt })) {
        throw new WalletAuthenticationRejectedError(
          "Wallet authentication challenge was already used or expired",
        );
      }
      const token = NonceSchema.parse(randomHex());
      const expiresAt = observedAt + WALLET_SESSION_LIFETIME_SEC;
      await repository.createSession({ tokenHash: digest(token), owner, expiresAt });
      return { token, owner, expiresAt };
    },

    async readSession(rawToken: string) {
      const parsed = NonceSchema.safeParse(rawToken);
      if (!parsed.success) throw new WalletSessionRejectedError("Wallet authentication session is invalid or expired");
      const token = parsed.data;
      const session = await repository.readSession({ tokenHash: digest(token), nowSec: now() });
      if (!session) throw new WalletSessionRejectedError("Wallet authentication session is invalid or expired");
      return session;
    },

    beginCompilation(input: { owner: Address; clientKey: string; goal: string; actionPreference: string }) {
      return repository.beginCompilation({ ...input, goalHash: digest(`${input.actionPreference}:${input.goal}`), nowSec: now() });
    },
    completeCompilation: (id: string, result: unknown) => repository.completeCompilation(id, result, now()),
    failCompilation: (id: string) => repository.failCompilation(id, now()),
  };
}
