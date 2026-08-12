import { describe, expect, it } from "vitest";
import { readPaymentConfig, readPaymentTermsConfig } from "./config";

const serverPaymentEnv = {
  MPPX_SECRET_KEY: "m".repeat(32),
  COBIA_TREASURY: "0x3333333333333333333333333333333333333333",
  PAYMENT_REALM: "pay.cobia.example",
};

describe("payment environment", () => {
  it("returns only the fixed X Layer mainnet payment support", () => {
    expect(readPaymentConfig(serverPaymentEnv)).toEqual({
      MPPX_SECRET_KEY: "m".repeat(32),
      COBIA_TREASURY: "0x3333333333333333333333333333333333333333",
      PAYMENT_REALM: "pay.cobia.example",
      PAYMENT_CHAIN_ID: 196,
      PAYMENT_ASSET: "0x779Ded0c9e1022225f8E0630b35a9b54bE713736",
      PAYMENT_DECIMALS: 6,
    });
  });

  it.each([
    ["PAYMENT_CHAIN_ID", "1952"],
    ["PAYMENT_ASSET", "0x9e29b3AaDa05Bf2D2c827Af80Bd28Dc0b9b4FB0c"],
  ])("rejects the legacy %s override", (name, value) => {
    expect(() => readPaymentConfig({ ...serverPaymentEnv, [name]: value }))
      .toThrow(`Missing or invalid payment configuration: ${name}`);
  });

  it("accepts redundant legacy keys only when they match fixed support", () => {
    expect(readPaymentConfig({
      ...serverPaymentEnv,
      PAYMENT_CHAIN_ID: "196",
      PAYMENT_ASSET: "0x779ded0c9e1022225f8e0630b35a9b54be713736",
    })).toMatchObject({
      PAYMENT_CHAIN_ID: 196,
      PAYMENT_ASSET: "0x779Ded0c9e1022225f8E0630b35a9b54bE713736",
    });
  });

  it("requires a canonical payment realm", () => {
    expect(() => readPaymentConfig({
      MPPX_SECRET_KEY: serverPaymentEnv.MPPX_SECRET_KEY,
      COBIA_TREASURY: serverPaymentEnv.COBIA_TREASURY,
    }))
      .toThrow("Missing or invalid payment configuration: PAYMENT_REALM");
  });

  it("exposes canonical non-secret terms configuration without the MPP secret", () => {
    expect(readPaymentTermsConfig({
      COBIA_TREASURY: serverPaymentEnv.COBIA_TREASURY,
      PAYMENT_REALM: serverPaymentEnv.PAYMENT_REALM,
    })).toEqual({
      COBIA_TREASURY: "0x3333333333333333333333333333333333333333",
      PAYMENT_REALM: "pay.cobia.example",
      PAYMENT_CHAIN_ID: 196,
      PAYMENT_ASSET: "0x779Ded0c9e1022225f8E0630b35a9b54bE713736",
      PAYMENT_DECIMALS: 6,
    });
  });
});
