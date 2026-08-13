import { describe, expect, it } from "vitest";
import { registryHash } from "../adapters/registry";
import { productionCapabilityManifestV1 } from "./manifest";

describe("production capability manifest", () => {
  it("publishes parameter semantics and pinned identities for sandbox research", () => {
    const manifest = productionCapabilityManifestV1();
    expect(manifest).toMatchObject({ version: 1, chainId: 196, registryHash });
    expect(manifest.capabilities.map(({ id, version }) => `${id}@${version}`)).toEqual([
      "aave-v3.supply@1",
      "curve-stableswap-ng.exact-input@1",
      "uniswap-v3.exact-input@1",
    ]);
    expect(manifest.deployments.length).toBeGreaterThan(3);
    expect(JSON.stringify(manifest)).not.toMatch(/private|secret|api.?key/i);
  });
});
