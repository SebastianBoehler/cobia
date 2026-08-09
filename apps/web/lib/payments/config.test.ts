import { describe, expect, it } from "vitest";
import { buildWinnerCharge } from "./config";

describe("winner charge", () => {
  it("charges ten cents total with a ten-percent Cobia split", () => {
    expect(buildWinnerCharge({
      chainId: 1952,
      currency: "0x1111111111111111111111111111111111111111",
      solver: "0x2222222222222222222222222222222222222222",
      treasury: "0x3333333333333333333333333333333333333333",
      quoteId: `0x${"ab".repeat(32)}`,
    })).toEqual({
      amount: "100000",
      currency: "0x1111111111111111111111111111111111111111",
      recipient: "0x2222222222222222222222222222222222222222",
      description: "Reveal Cobia verified yield route",
      externalId: `0x${"ab".repeat(32)}`,
      methodDetails: {
        chainId: 1952,
        feePayer: true,
        splits: [{ amount: "10000", recipient: "0x3333333333333333333333333333333333333333", memo: "cobia-platform" }],
      },
    });
  });
});
