import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { writeHeartbeat } from "./heartbeat";

let temporaryDirectory: string | undefined;
afterEach(async () => {
  if (temporaryDirectory) await rm(temporaryDirectory, { recursive: true });
});

describe("solver heartbeat", () => {
  it("records the latest successful poll beside durable state", async () => {
    temporaryDirectory = await mkdtemp(join(tmpdir(), "cobia-heartbeat-"));
    const statePath = join(temporaryDirectory, "solver", "state.json");

    await writeHeartbeat(statePath, new Date("2026-08-21T12:00:00.000Z"));

    await expect(readFile(join(temporaryDirectory, "solver", "heartbeat"), "utf8"))
      .resolves.toBe("2026-08-21T12:00:00.000Z\n");
  });
});
