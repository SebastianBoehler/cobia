import { describe, expect, it } from "vitest";
import { addSafeBatchChecksum, buildSafeBatch } from "./safe-batch";

const safe = "0xDF8a1Ce35c9a6ACE153B4e0767942f1E2291a1Aa" as const;
const owner = "0x49d4450977E2c95362C13D3a31a09311E0Ea26A6" as const;

describe("Safe transaction builder batch", () => {
  it("matches the checksum fixture maintained by Safe", () => {
    const batch = addSafeBatchChecksum({
      version: "1.0",
      chainId: "4",
      createdAt: 1_646_321_521_061,
      meta: {
        name: "test batch file",
        txBuilderVersion: "1.4.0",
        checksum: "",
        createdFromSafeAddress: safe,
        createdFromOwnerAddress: owner,
      },
      transactions: [{
        to: owner,
        value: "2",
        data: "0x42f45790",
      }],
    });

    expect(batch.meta.checksum).toBe(
      "0x5ea88a337bf6090121e3c5300d4540150bdcaebdc7338cdbb249eff92d70dc5f",
    );
  });

  it("builds checksummed chain-196 call-only transactions", () => {
    const batch = buildSafeBatch({
      chainId: 196,
      safe,
      name: "Cobia proposals",
      description: "Starts the delayed activation window.",
      createdAt: 1_000,
      transactions: [{ to: owner, value: "0x0", data: "0x1234" }],
    });

    expect(batch.chainId).toBe("196");
    expect(batch.transactions).toEqual([{ to: owner, value: "0", data: "0x1234" }]);
    expect(batch.meta.createdFromOwnerAddress).toBe("");
    expect(batch.meta.checksum).toMatch(/^0x[0-9a-f]{64}$/);
  });

  it("binds the requested chain into the checksummed batch", () => {
    const batch = buildSafeBatch({
      chainId: 1,
      safe,
      name: "Ethereum proposals",
      description: "Starts the delayed activation window.",
      createdAt: 1_000,
      transactions: [{ to: owner, value: "0x0", data: "0x1234" }],
    });

    expect(batch.chainId).toBe("1");
    expect(batch.meta.checksum).toMatch(/^0x[0-9a-f]{64}$/);
  });
});
