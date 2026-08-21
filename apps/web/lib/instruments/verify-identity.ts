import type { Address, Hash } from "viem";
import { instrumentCommitmentV1, resolveInstrumentV1 } from "./production-registry";

export async function verifyRegisteredInstrumentIdentityV1(input: {
  chainId: 1 | 196;
  token: Address;
  jurisdiction: string;
  instrumentCommitment: Hash;
  nowSec: number;
  blockNumber: bigint;
}, dependencies: {
  getCodeHash(chainId: 1 | 196, token: Address, blockNumber: bigint): Promise<Hash | undefined>;
}): Promise<{ accepted: true; errorCodes: [] } | { accepted: false; errorCodes: string[] }> {
  try {
    const instrument = resolveInstrumentV1({
      chainId: input.chainId,
      token: input.token,
      jurisdiction: input.jurisdiction,
      nowSec: input.nowSec,
    });
    if (instrumentCommitmentV1(instrument) !== input.instrumentCommitment) {
      return { accepted: false, errorCodes: ["INSTRUMENT_IDENTITY_CHANGED"] };
    }
    const currentCodeHash = await dependencies.getCodeHash(
      input.chainId, input.token, input.blockNumber,
    );
    if (currentCodeHash !== instrument.runtimeCodeHash) {
      return { accepted: false, errorCodes: ["INSTRUMENT_CODE_IDENTITY_CHANGED"] };
    }
    return { accepted: true, errorCodes: [] };
  } catch (error) {
    const code = error && typeof error === "object" && "code" in error
      ? String(error.code) : "INSTRUMENT_NOT_REGISTERED";
    return { accepted: false, errorCodes: [code] };
  }
}
