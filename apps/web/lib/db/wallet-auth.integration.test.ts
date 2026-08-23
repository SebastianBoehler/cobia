import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createWalletAuthRepository } from "./wallet-auth";
import { startIntegrationDatabase } from "./integration-database";

type Database = Awaited<ReturnType<typeof startIntegrationDatabase>>;
let database: Database | undefined;
const owner = "0x1111111111111111111111111111111111111111" as const;
const nowSec = 2_000_000_000;

function repository() {
  if (!database) throw new Error("Integration database did not start");
  return createWalletAuthRepository(database.db);
}

beforeAll(async () => {
  database = await startIntegrationDatabase({ throughMigration: "0019_open_solver_exchange" });
  await database.applyMigration("0020_wallet_auth");
});
afterAll(async () => { await database?.close(); });

describe("wallet authentication repository", () => {
  it("atomically consumes a challenge once and expires opaque sessions", async () => {
    const auth = repository();
    await auth.createChallenge({ nonceHash: "aa".repeat(32), owner,
      message: "exact message", expiresAt: nowSec + 300 });
    await expect(auth.readChallenge({ nonceHash: "aa".repeat(32), owner, nowSec }))
      .resolves.toMatchObject({ message: "exact message" });
    const consumed = await Promise.all([
      auth.consumeChallenge({ nonceHash: "aa".repeat(32), owner, nowSec }),
      auth.consumeChallenge({ nonceHash: "aa".repeat(32), owner, nowSec }),
    ]);
    expect(consumed.filter(Boolean)).toHaveLength(1);

    await auth.createSession({ tokenHash: "bb".repeat(32), owner, expiresAt: nowSec + 900 });
    await expect(auth.readSession({ tokenHash: "bb".repeat(32), nowSec }))
      .resolves.toMatchObject({ owner });
    await expect(auth.readSession({ tokenHash: "bb".repeat(32), nowSec: nowSec + 900 }))
      .resolves.toBeNull();
  });

  it("serializes wallet work, caches results, and applies the owner rate limit", async () => {
    const auth = repository();
    const base = { owner, clientKey: "cc".repeat(32), actionPreference: "aave-supply", nowSec };
    const admissions = await Promise.all([
      auth.beginCompilation({ ...base, goalHash: "01".repeat(32) }),
      auth.beginCompilation({ ...base, goalHash: "02".repeat(32) }),
    ]);
    expect(admissions.map(({ kind }) => kind).sort()).toEqual(["busy", "run"]);
    const first = admissions.find((value) => value.kind === "run");
    if (!first || first.kind !== "run") throw new Error("Missing compilation lease");
    const firstGoalHash = admissions[0]?.kind === "run" ? "01".repeat(32) : "02".repeat(32);
    await auth.completeCompilation(first.id, { status: "review" }, nowSec + 1);
    await expect(auth.readCompletedCompilation({ id: first.id, owner, nowSec: nowSec + 2 }))
      .resolves.toEqual({ status: "review" });
    await expect(auth.readCompletedCompilation({ id: first.id,
      owner: "0x2222222222222222222222222222222222222222", nowSec: nowSec + 2 }))
      .resolves.toBeNull();
    await expect(auth.readCompletedCompilation({ id: first.id, owner, nowSec: nowSec + 302 }))
      .resolves.toBeNull();
    await expect(auth.beginCompilation({ ...base, goalHash: firstGoalHash, nowSec: nowSec + 2 }))
      .resolves.toEqual({ kind: "cached", result: { status: "review" } });

    for (let index = 2; index <= 5; index += 1) {
      const admission = await auth.beginCompilation({ ...base,
        goalHash: (index + 16).toString(16).repeat(32), nowSec: nowSec + index });
      expect(admission.kind).toBe("run");
      if (admission.kind === "run") await auth.failCompilation(admission.id, nowSec + index);
    }
    await expect(auth.beginCompilation({ ...base, goalHash: "06".repeat(32), nowSec: nowSec + 6 }))
      .resolves.toEqual({ kind: "limited" });
  });
});
