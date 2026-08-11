import { describe, expect, it } from "vitest";
import { NOW_SEC } from "../execution-v2/test-fixtures";
import { signConfiguredAtomicAuthorizationV1 } from "./authorization-server";
import { projectAtomicRouteV1 } from "./project-route";
import { verifiedAtomicFixture } from "./test-fixture";

const executor = "0x2222222222222222222222222222222222222222" as const;

async function projectedFixture() {
  return projectAtomicRouteV1({
    ...await verifiedAtomicFixture(),
    executor,
    simulationHash: `0x${"52".repeat(32)}`,
    nonce: `0x${"53".repeat(32)}`,
    nowSec: NOW_SEC,
  });
}

describe("configured atomic verifier", () => {
  it("fails closed on missing or malformed server keys", async () => {
    const projected = await projectedFixture();
    await expect(signConfiguredAtomicAuthorizationV1(
      { projected, nowSec: NOW_SEC },
      {},
    )).rejects.toThrow("ATOMIC_VERIFIER_PRIVATE_KEY");
    await expect(signConfiguredAtomicAuthorizationV1(
      { projected, nowSec: NOW_SEC },
      { ATOMIC_VERIFIER_PRIVATE_KEY: "not-a-key" },
    )).rejects.toThrow("ATOMIC_VERIFIER_PRIVATE_KEY");
  });

  it("signs only with the configured server-side verifier", async () => {
    const projected = await projectedFixture();
    await expect(signConfiguredAtomicAuthorizationV1(
      { projected, nowSec: NOW_SEC },
      { ATOMIC_VERIFIER_PRIVATE_KEY: `0x${"61".repeat(32)}` },
    )).resolves.toMatchObject({
      authorization: { routeHash: projected.route.routeHash },
    });
  });
});
