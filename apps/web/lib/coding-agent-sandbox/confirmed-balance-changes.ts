import { isNativeAssetAddress } from "@cobia/domain";
import { getAddress, isAddressEqual, type Address } from "viem";
import { z } from "zod";

const DeltaSchema = z.object({
  token: z.string(),
  account: z.string(),
  beforeAtomic: z.string().regex(/^(0|[1-9][0-9]*)$/),
  afterAtomic: z.string().regex(/^(0|[1-9][0-9]*)$/),
}).passthrough();
const BalanceEvidenceSchema = z.object({
  balanceDeltas: z.array(DeltaSchema).max(32),
}).passthrough();
const SimulationEvidenceSchema = z.object({ simulations: z.array(z.object({
  blockNumber: z.string().regex(/^(0|[1-9][0-9]*)$/).optional(),
  assetDeltas: z.array(DeltaSchema).max(32),
}).passthrough()).max(32) }).passthrough();

export async function readConfirmedBalanceChanges(input: {
  evidence: unknown;
  owner: Address;
  blockNumber: bigint;
  readBalance(token: Address, owner: Address, blockNumber: bigint): Promise<bigint>;
  readNativeBalance?(owner: Address, blockNumber: bigint): Promise<bigint>;
}) {
  const balances = BalanceEvidenceSchema.safeParse(input.evidence);
  const simulations = SimulationEvidenceSchema.safeParse(input.evidence);
  const deltas = balances.success ? balances.data.balanceDeltas.map((delta) => ({ ...delta,
    baselineBlockNumber: undefined as string | undefined }))
    : simulations.success
      ? simulations.data.simulations.flatMap(({ assetDeltas, blockNumber }) => assetDeltas.map((delta) => ({
        ...delta, baselineBlockNumber: blockNumber,
      })))
      : [];
  if (deltas.length === 0) return [];
  const ownerDeltas = new Map<Address, (typeof deltas)[number]>();
  for (const delta of deltas) {
    if (!isAddressEqual(getAddress(delta.account), input.owner)) continue;
    const token = getAddress(delta.token);
    if (!ownerDeltas.has(token)) ownerDeltas.set(token, delta);
  }
  const changes = await Promise.all([...ownerDeltas.entries()].map(async ([token, delta]) => {
    const native = isNativeAssetAddress(token);
    if (native && !input.readNativeBalance) throw new Error("Native balance reader is unavailable");
    const beforeAtomic = native && delta.baselineBlockNumber
      ? (await input.readNativeBalance!(input.owner, BigInt(delta.baselineBlockNumber))).toString()
      : delta.beforeAtomic;
    const afterAtomic = (await (native
      ? input.readNativeBalance!(input.owner, input.blockNumber)
      : input.readBalance(token, input.owner, input.blockNumber))).toString();
    return { token, beforeAtomic, afterAtomic };
  }));
  return changes.filter(({ beforeAtomic, afterAtomic }) => BigInt(beforeAtomic) !== BigInt(afterAtomic));
}
