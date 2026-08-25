import { isNativeAssetAddress, type OpenIntentPolicyV3 } from "@cobia/domain";
import { getAddress, isAddressEqual, type Address } from "viem";
import { z } from "zod";

const EvidenceSchema = z.object({ simulations: z.array(z.object({
  blockNumber: z.string().regex(/^(0|[1-9][0-9]*)$/),
  assetDeltas: z.array(z.object({ token: z.string(), account: z.string() }).passthrough()).max(32),
}).passthrough()).max(32) }).passthrough();

export async function assertConfirmedOutcomeBalances(input: {
  outcomes: OpenIntentPolicyV3["outcomes"];
  evidence: unknown;
  owner: Address;
  finalBlockNumber: bigint;
  readBalance(token: Address, owner: Address, blockNumber: bigint): Promise<bigint>;
  readNativeBalance(owner: Address, blockNumber: bigint): Promise<bigint>;
}) {
  const evidence = EvidenceSchema.parse(input.evidence);
  const read = (token: Address, blockNumber: bigint) => isNativeAssetAddress(token)
    ? input.readNativeBalance(input.owner, blockNumber)
    : input.readBalance(token, input.owner, blockNumber);
  for (const outcome of input.outcomes) {
    if (outcome.kind !== "minimum-final" && outcome.kind !== "minimum-increase" &&
        outcome.kind !== "registered-instrument") continue;
    const token = getAddress(outcome.token);
    const finalBalance = await read(token, input.finalBlockNumber);
    if (outcome.kind === "minimum-final") {
      if (finalBalance < BigInt(outcome.atomic)) {
        throw new Error("Confirmed execution did not satisfy the signed outcome");
      }
      continue;
    }
    const simulation = evidence.simulations.find(({ assetDeltas }) => assetDeltas.some((delta) =>
      isAddressEqual(getAddress(delta.token), token) &&
      isAddressEqual(getAddress(delta.account), input.owner)));
    if (!simulation) throw new Error("Open execution outcome baseline is unavailable");
    const baseline = await read(token, BigInt(simulation.blockNumber));
    const increase = BigInt(outcome.kind === "registered-instrument"
      ? outcome.minimumIncreaseAtomic : outcome.atomic);
    if (finalBalance < baseline + increase) {
      throw new Error("Confirmed execution did not satisfy the signed outcome");
    }
  }
}
