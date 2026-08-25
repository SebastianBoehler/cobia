export class ReplayQueueFullError extends Error {}

type Release = () => void;

export class ReplayCapacity {
  private activeCount = 0;
  private readonly waiting: Array<(release: Release) => void> = [];

  constructor(
    private readonly capacity: number,
    private readonly maximumQueue: number,
  ) {
    if (!Number.isInteger(capacity) || capacity < 1 ||
        !Number.isInteger(maximumQueue) || maximumQueue < 0) {
      throw new Error("Replay capacity must use positive integer bounds");
    }
  }

  snapshot() {
    return { active: this.activeCount, capacity: this.capacity, queued: this.waiting.length };
  }

  acquire(): Promise<Release> {
    if (this.activeCount < this.capacity) {
      this.activeCount += 1;
      return Promise.resolve(this.release());
    }
    if (this.waiting.length >= this.maximumQueue) {
      return Promise.reject(new ReplayQueueFullError("Replay queue is full"));
    }
    return new Promise((resolve) => this.waiting.push(resolve));
  }

  private release(): Release {
    let released = false;
    return () => {
      if (released) return;
      released = true;
      const next = this.waiting.shift();
      if (next) next(this.release());
      else this.activeCount -= 1;
    };
  }
}
