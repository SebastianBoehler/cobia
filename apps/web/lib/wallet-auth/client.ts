import { stringToHex, type Address } from "viem";
import type { Eip1193Request } from "../wallet/eip1193";

async function json(response: Response): Promise<Record<string, unknown>> {
  const value = await response.json();
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Wallet authentication returned an invalid response.");
  }
  return value as Record<string, unknown>;
}

export async function authenticateIntentCompiler(input: {
  owner: Address;
  request(value: Eip1193Request): Promise<unknown>;
  fetcher?: typeof fetch;
}): Promise<void> {
  const fetcher = input.fetcher ?? fetch;
  const challengeResponse = await fetcher("/api/wallet-auth/challenge", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ owner: input.owner }),
  });
  const challenge = await json(challengeResponse);
  if (!challengeResponse.ok || typeof challenge.message !== "string" ||
    typeof challenge.nonce !== "string") {
    throw new Error(typeof challenge.message === "string" ? challenge.message
      : "Wallet authentication could not start.");
  }
  const signature = await input.request({
    method: "personal_sign", params: [stringToHex(challenge.message), input.owner],
  });
  if (typeof signature !== "string" || !/^0x[0-9a-fA-F]{130}$/.test(signature)) {
    throw new Error("The wallet returned an invalid authentication signature.");
  }
  const sessionResponse = await fetcher("/api/wallet-auth/session", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ owner: input.owner, nonce: challenge.nonce, signature }),
  });
  const session = await json(sessionResponse);
  if (!sessionResponse.ok) {
    throw new Error(typeof session.message === "string" ? session.message
      : "Wallet authentication was rejected.");
  }
}
