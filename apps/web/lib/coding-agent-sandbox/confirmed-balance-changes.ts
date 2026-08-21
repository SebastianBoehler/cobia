import { getAddress, isAddressEqual, type Address } from "viem";
import { z } from "zod";

const EvidenceSchema = z.object({
  balanceDeltas: z.array(z.object({
    token: z.string(),
    account: z.string(),
    beforeAtomic: z.string().regex(/^(0|[1-9][0-9]*)$/),
  }).passthrough()).max(32),
}).passthrough();

export async function readConfirmedBalanceChanges(input: {
  evidence: unknown;
  owner: Address;
  blockNumber: bigint;
  readBalance(token: Address, owner: Address, blockNumber: bigint): Promise<bigint>;
}) {
  const parsed = EvidenceSchema.safeParse(input.evidence);
  if (!parsed.success) return [];
  const ownerDeltas = parsed.data.balanceDeltas.filter(({ account }) =>
    isAddressEqual(getAddress(account), input.owner));
  return Promise.all(ownerDeltas.map(async ({ token, beforeAtomic }) => ({
    token: getAddress(token),
    beforeAtomic,
    afterAtomic: (await input.readBalance(
      getAddress(token), input.owner, input.blockNumber,
    )).toString(),
  })));
}
