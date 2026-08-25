import { describe, expect, it } from "vitest";
import {
  REFERENCE_TRANSACTION_VALIDITY_SEC,
  referenceTransactionExpiry,
} from "../src/transaction-validity";

describe("reference transaction validity", () => {
  it("never produces a quote window longer than the strict OKX verifier accepts", () => {
    expect(REFERENCE_TRANSACTION_VALIDITY_SEC).toBe(30);
    expect(referenceTransactionExpiry(2_000_000_000)).toBe(2_000_000_030);
    expect(referenceTransactionExpiry(2_000_000_000, 2_000_000_012)).toBe(2_000_000_012);
  });
});
