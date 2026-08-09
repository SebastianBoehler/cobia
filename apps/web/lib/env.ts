import { z } from "zod";
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
