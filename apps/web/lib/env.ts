import { z } from "zod";
import type { Hex } from "viem";
import type { OkxCredentials } from "./okx/auth";

const OkxEnvSchema = z.object({
  OKX_API_KEY: z.string().min(1),
  OKX_SECRET_KEY: z.string().min(1),
  OKX_PASSPHRASE: z.string().min(1),
});

export function readOkxCredentials(
  source: Record<string, string | undefined> = process.env,
): OkxCredentials {
  const parsed = OkxEnvSchema.safeParse(source);
  if (!parsed.success) {
    const missing = parsed.error.issues.map((issue) => issue.path.join(".")).join(", ");
    throw new Error(`Missing or invalid OKX server configuration: ${missing}`);
  }

  return {
    apiKey: parsed.data.OKX_API_KEY,
    secretKey: parsed.data.OKX_SECRET_KEY,
    passphrase: parsed.data.OKX_PASSPHRASE,
  };
}

const MarketEnvSchema = z.object({
  DATABASE_URL: z.string().url(),
  DETERMINISTIC_SOLVER_PRIVATE_KEY: z.string().regex(/^0x[0-9a-fA-F]{64}$/).transform((value) => value as Hex),
  AI_SOLVER_PRIVATE_KEY: z.string().regex(/^0x[0-9a-fA-F]{64}$/).transform((value) => value as Hex),
  OPENAI_API_KEY: z.string().min(1),
  OPENAI_SOLVER_MODEL: z.string().min(1),
  XLAYER_RPC_URL: z.string().url().default("https://rpc.xlayer.tech"),
});

export function readDatabaseUrl(
  source: Record<string, string | undefined> = process.env,
): string {
  const parsed = z.string().url().safeParse(source.DATABASE_URL);
  if (!parsed.success) throw new Error("Missing or invalid database configuration: DATABASE_URL");
  return parsed.data;
}

export function readMarketConfig(
  source: Record<string, string | undefined> = process.env,
) {
  const parsed = MarketEnvSchema.safeParse(source);
  if (!parsed.success) {
    const invalid = parsed.error.issues.map((issue) => issue.path.join(".")).join(", ");
    throw new Error(`Missing or invalid market configuration: ${invalid}`);
  }
  return parsed.data;
}
