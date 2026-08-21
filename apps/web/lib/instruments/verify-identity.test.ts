import { describe, expect, it, vi } from "vitest";
import { instrumentCommitmentV1, resolveInstrumentV1 } from "./production-registry";
import { verifyRegisteredInstrumentIdentityV1 } from "./verify-identity";

const token = "0x8ad3c73f833d3f9a523ab01476625f269aeb7cf0" as const;
const instrument = resolveInstrumentV1({
  chainId: 196, token, jurisdiction: "DE", nowSec: 1_787_298_527,
});
const input = {
  chainId: 196 as const,
  token,
  jurisdiction: "DE",
  instrumentCommitment: instrumentCommitmentV1(instrument),
  nowSec: 1_787_298_527,
  blockNumber: 68_529_386n,
};

describe("registered instrument identity verification", () => {
  it("links the signed instrument commitment to current token bytecode", async () => {
    await expect(verifyRegisteredInstrumentIdentityV1(input, {
      getCodeHash: vi.fn().mockResolvedValue(instrument.runtimeCodeHash),
    })).resolves.toEqual({ accepted: true, errorCodes: [] });
  });

  it("rejects a changed token implementation surface", async () => {
    await expect(verifyRegisteredInstrumentIdentityV1(input, {
      getCodeHash: vi.fn().mockResolvedValue(`0x${"ff".repeat(32)}`),
    })).resolves.toEqual({ accepted: false, errorCodes: ["INSTRUMENT_CODE_IDENTITY_CHANGED"] });
  });

  it("rejects a policy commitment that no longer matches the registry", async () => {
    await expect(verifyRegisteredInstrumentIdentityV1({
      ...input, instrumentCommitment: `0x${"aa".repeat(32)}`,
    }, { getCodeHash: vi.fn() })).resolves.toEqual({
      accepted: false, errorCodes: ["INSTRUMENT_IDENTITY_CHANGED"],
    });
  });
});
