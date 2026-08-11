import { privateKeyToAccount } from "viem/accounts";
import { signAtomicAuthorizationV1 } from "./authorization";
import type { ProjectedAtomicRouteV1 } from "./types";

type AtomicVerifierEnvironment = Record<string, string | undefined>;

function configuredVerifierAccount(env: AtomicVerifierEnvironment) {
  const privateKey = env.ATOMIC_VERIFIER_PRIVATE_KEY;
  if (!privateKey || !/^0x[0-9a-fA-F]{64}$/.test(privateKey)) {
    throw new Error("ATOMIC_VERIFIER_PRIVATE_KEY is missing or malformed");
  }
  return privateKeyToAccount(privateKey as `0x${string}`);
}

export async function signConfiguredAtomicAuthorizationV1(
  input: { projected: ProjectedAtomicRouteV1; nowSec: number },
  env: AtomicVerifierEnvironment = process.env,
) {
  return signAtomicAuthorizationV1(input, {
    account: configuredVerifierAccount(env),
  });
}
