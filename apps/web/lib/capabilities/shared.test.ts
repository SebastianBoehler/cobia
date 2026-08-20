import { commitment } from "@cobia/domain";
import { describe, expect, it } from "vitest";
import { productionCapabilityManifestV1 } from "./manifest";
import { assertProductionManifest } from "./shared";

describe("production capability manifest binding", () => {
  it("accepts the full manifest commitment used by open V2 intents", () => {
    const manifest = productionCapabilityManifestV1();

    expect(() => assertProductionManifest(manifest, commitment(manifest))).not.toThrow();
  });

  it("rejects a manifest commitment outside the production registry", () => {
    expect(() => assertProductionManifest(
      productionCapabilityManifestV1(), `0x${"11".repeat(32)}`,
    )).toThrow("does not match");
  });
});
