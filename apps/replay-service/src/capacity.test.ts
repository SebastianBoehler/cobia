import { describe, expect, it } from "vitest";
import { ReplayCapacity, ReplayQueueFullError } from "./capacity";

describe("replay capacity", () => {
  it("serializes a verifier burst instead of rejecting the second replay", async () => {
    const capacity = new ReplayCapacity(1, 2);
    const first = await capacity.acquire();
    let acquired = false;
    const second = capacity.acquire().then((release) => { acquired = true; return release; });

    await Promise.resolve();
    expect(acquired).toBe(false);
    expect(capacity.snapshot()).toEqual({ active: 1, capacity: 1, queued: 1 });

    first();
    const release = await second;
    expect(acquired).toBe(true);
    expect(capacity.snapshot()).toEqual({ active: 1, capacity: 1, queued: 0 });
    release();
    expect(capacity.snapshot()).toEqual({ active: 0, capacity: 1, queued: 0 });
  });

  it("keeps a hard bound on queued replay work", async () => {
    const capacity = new ReplayCapacity(1, 1);
    const release = await capacity.acquire();
    const queued = capacity.acquire();
    await expect(capacity.acquire()).rejects.toBeInstanceOf(ReplayQueueFullError);
    release();
    (await queued)();
  });
});
