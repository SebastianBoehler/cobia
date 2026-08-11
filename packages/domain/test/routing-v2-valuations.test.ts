import { describe, expect, it } from "vitest";
import {
  AssetValuationV2Schema,
  RouteSnapshotV2Schema,
} from "../src/index";
import {
  inputAssetV2,
  outputAssetV2,
  snapshotV2,
} from "./routing-v2-fixtures";

describe("V2 snapshot asset valuations", () => {
  it("rejects duplicate or noncanonical valuation ordering", () => {
    const duplicate = [snapshotV2.valuations[0], snapshotV2.valuations[0]];
    expect(RouteSnapshotV2Schema.safeParse({ ...snapshotV2, valuations: duplicate }).success)
      .toBe(false);
    expect(RouteSnapshotV2Schema.safeParse({
      ...snapshotV2,
      valuations: [...snapshotV2.valuations].reverse(),
    }).success).toBe(false);
  });

  it("requires valuations for both sides of every opportunity", () => {
    const inputOnly = snapshotV2.valuations.filter(({ asset }) => asset === inputAssetV2);
    expect(RouteSnapshotV2Schema.safeParse({ ...snapshotV2, valuations: inputOnly }).success)
      .toBe(false);
    expect(snapshotV2.opportunities.some(
      (opportunity) => opportunity.kind === "aave-v3-supply" && opportunity.asset === outputAssetV2,
    )).toBe(true);
  });

  it.each([-1, 1.5, 256])("rejects token decimals %s", (decimals) => {
    expect(AssetValuationV2Schema.safeParse({
      asset: inputAssetV2,
      decimals,
      priceUsdE8: "100000000",
    }).success).toBe(false);
  });

  it("requires a positive integer USD E8 price", () => {
    expect(AssetValuationV2Schema.safeParse({
      asset: inputAssetV2,
      decimals: 6,
      priceUsdE8: "0",
    }).success).toBe(false);
  });

  it("canonicalizes valuation addresses", () => {
    expect(AssetValuationV2Schema.parse({
      asset: "0x779Ded0c9e1022225f8E0630b35a9b54bE713736",
      decimals: 6,
      priceUsdE8: "100000000",
    }).asset).toBe("0x779ded0c9e1022225f8e0630b35a9b54be713736");
  });
});
