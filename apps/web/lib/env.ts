import { z } from "zod";
import { isAddress, type Address, type Hex } from "viem";
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
  XLAYER_RPC_URL: z.string().url().default("https://rpc.xlayer.tech"),
});

const AgenticSolverEnvSchema = z.object({
  OPENAI_API_KEY: z.string().min(1),
  OPENAI_SOLVER_MODEL: z.string().min(1),
  AI_SOLVER_PRIVATE_KEY: z.string().regex(/^0x[0-9a-fA-F]{64}$/)
    .transform((value) => value as Hex),
});

const CodingAgentRpcProxyEnvSchema = z.object({
  CODING_AGENT_PUBLIC_ORIGIN: z.url().refine((value) => new URL(value).protocol === "https:"),
  VERCEL_TEAM_ID: z.string().min(1),
  VERCEL_PROJECT_ID: z.string().min(1),
  XLAYER_RPC_URL: z.url().refine((value) => new URL(value).protocol === "https:"),
});

const CodingAgentRuntimeEnvSchema = z.object({
  OPENAI_API_KEY: z.string().min(1),
  OPENAI_CODING_AGENT_MODEL: z.string().min(1),
  COBIA_EXECUTOR_V2_ADDRESS: z.string().refine(isAddress)
    .transform((value) => value as Address),
  COBIA_EXECUTOR_V2_CODE_HASH: z.string().regex(/^0x[0-9a-fA-F]{64}$/)
    .transform((value) => value as Hex),
  COBIA_VERIFIER_PRIVATE_KEY: z.string().regex(/^0x[0-9a-fA-F]{64}$/)
    .transform((value) => value as Hex),
  CODING_AGENT_PUBLIC_ORIGIN: z.url().refine((value) => new URL(value).protocol === "https:"),
  XLAYER_RPC_URL: z.url().default("https://rpc.xlayer.tech"),
});

const CodingAgentV3ExecutionEnvSchema = z.object({
  COBIA_EXECUTOR_V3_ADDRESS: z.string().refine(isAddress)
    .transform((value) => value as Address),
  COBIA_EXECUTOR_V3_CODE_HASH: z.string().regex(/^0x[0-9a-fA-F]{64}$/)
    .transform((value) => value as Hex),
  COBIA_VERIFIER_PRIVATE_KEY: z.string().regex(/^0x[0-9a-fA-F]{64}$/)
    .transform((value) => value as Hex),
  XLAYER_RPC_URL: z.url().default("https://rpc.xlayer.tech"),
});

const CodingAgentV3RuntimeEnvSchema = CodingAgentV3ExecutionEnvSchema.extend({
  OPENAI_API_KEY: z.string().min(1),
  OPENAI_CODING_AGENT_MODEL: z.string().min(1),
  CODING_AGENT_PUBLIC_ORIGIN: z.url().refine((value) => new URL(value).protocol === "https:"),
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

export function readAgenticSolverConfig(
  source: Record<string, string | undefined> = process.env,
) {
  const parsed = AgenticSolverEnvSchema.safeParse(source);
  if (!parsed.success) {
    const invalid = parsed.error.issues.map((issue) => issue.path.join(".")).join(", ");
    throw new Error(`Missing or invalid agentic solver configuration: ${invalid}`);
  }
  return parsed.data;
}

export function readCodingAgentRpcProxyConfig(
  source: Record<string, string | undefined> = process.env,
) {
  const parsed = CodingAgentRpcProxyEnvSchema.safeParse(source);
  if (!parsed.success) {
    const invalid = parsed.error.issues.map((issue) => issue.path.join(".")).join(", ");
    throw new Error(`Missing or invalid coding-agent RPC proxy configuration: ${invalid}`);
  }
  return parsed.data;
}

export function readCodingAgentRuntimeConfig(
  source: Record<string, string | undefined> = process.env,
) {
  const parsed = CodingAgentRuntimeEnvSchema.safeParse(source);
  if (!parsed.success) {
    const invalid = parsed.error.issues.map((issue) => issue.path.join(".")).join(", ");
    throw new Error(`Missing or invalid coding-agent runtime configuration: ${invalid}`);
  }
  return parsed.data;
}

export function readCodingAgentV3ExecutionConfig(
  source: Record<string, string | undefined> = process.env,
) {
  const parsed = CodingAgentV3ExecutionEnvSchema.safeParse(source);
  if (!parsed.success) {
    const invalid = parsed.error.issues.map((issue) => issue.path.join(".")).join(", ");
    throw new Error(`Missing or invalid V3 execution configuration: ${invalid}`);
  }
  return parsed.data;
}

export function readCodingAgentV3RuntimeConfig(
  source: Record<string, string | undefined> = process.env,
) {
  const parsed = CodingAgentV3RuntimeEnvSchema.safeParse(source);
  if (!parsed.success) {
    const invalid = parsed.error.issues.map((issue) => issue.path.join(".")).join(", ");
    throw new Error(`Missing or invalid V3 coding-agent runtime configuration: ${invalid}`);
  }
  return parsed.data;
}

export function readExecutionSessionSecret(
  source: Record<string, string | undefined> = process.env,
): string {
  const parsed = z.string().min(32).safeParse(source.EXECUTION_SESSION_SECRET);
  if (!parsed.success) {
    throw new Error("Missing or invalid execution configuration: EXECUTION_SESSION_SECRET");
  }
  return parsed.data;
}
