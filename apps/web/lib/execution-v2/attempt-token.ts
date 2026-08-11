import { isAddress, type Address } from "viem";
import { z } from "zod";

const AttemptTokenPayloadSchema = z.object({
  attemptId: z.uuid(),
  buyer: z.string().refine(isAddress)
    .transform((value) => value.toLowerCase() as Address),
  expiresAt: z.number().int().positive().safe(),
}).strict();

export type AttemptTokenPayload = z.infer<typeof AttemptTokenPayloadSchema>;
export type AttemptTokenContext = Pick<AttemptTokenPayload, "attemptId" | "buyer">;

const AttemptTokenContextSchema = AttemptTokenPayloadSchema.pick({
  attemptId: true,
  buyer: true,
});

function keyBytes(secret: string) {
  const bytes = new TextEncoder().encode(secret);
  if (bytes.byteLength < 32) throw new Error("Execution session secret must be at least 32 bytes");
  return bytes;
}

async function hmacKey(secret: string) {
  return crypto.subtle.importKey(
    "raw",
    keyBytes(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

function encode(value: Uint8Array): string {
  return Buffer.from(value).toString("base64url");
}

function decode(value: string) {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) throw new Error("Attempt token is malformed");
  const buffer = Buffer.from(value, "base64url");
  const bytes = new Uint8Array(buffer.length);
  bytes.set(buffer);
  return bytes;
}

function assertWindow(expiresAt: number, nowSec: number): void {
  if (!Number.isSafeInteger(nowSec) || nowSec < 0) throw new Error("Current token time is invalid");
  if (expiresAt <= nowSec) throw new Error("Execution attempt token has expired");
  if (expiresAt > nowSec + 300) throw new Error("Execution attempt token is too long-lived");
}

export async function issueAttemptToken(
  value: AttemptTokenPayload,
  secret: string,
  nowSec: number,
): Promise<string> {
  const payload = AttemptTokenPayloadSchema.parse(value);
  assertWindow(payload.expiresAt, nowSec);
  const body = new TextEncoder().encode(JSON.stringify(payload));
  const signature = await crypto.subtle.sign("HMAC", await hmacKey(secret), body);
  return `${encode(body)}.${encode(new Uint8Array(signature))}`;
}

export async function verifyAttemptToken(
  token: string,
  expectedValue: AttemptTokenContext,
  secret: string,
  nowSec: number,
): Promise<AttemptTokenPayload> {
  const parts = token.split(".");
  if (parts.length !== 2 || !parts[0] || !parts[1]) throw new Error("Attempt token is malformed");
  const body = decode(parts[0]);
  const signature = decode(parts[1]);
  const verified = await crypto.subtle.verify("HMAC", await hmacKey(secret), signature, body);
  if (!verified) throw new Error("Attempt token signature is invalid");
  let decoded: unknown;
  try {
    decoded = JSON.parse(new TextDecoder().decode(body));
  } catch {
    throw new Error("Attempt token payload is invalid");
  }
  const payload = AttemptTokenPayloadSchema.parse(decoded);
  const expected = AttemptTokenContextSchema.parse(expectedValue);
  assertWindow(payload.expiresAt, nowSec);
  const matches = payload.attemptId === expected.attemptId
    && payload.buyer === expected.buyer;
  if (!matches) throw new Error("Attempt token does not match expected context");
  return payload;
}
