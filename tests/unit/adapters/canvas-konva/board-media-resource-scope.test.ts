import { describe, expect, it, vi } from "vitest";

import { BoardMediaResourceScope } from "../../../../src/adapters/canvas-konva/board-media-resource-scope";

describe("BoardMediaResourceScope", () => {
  it("rejects pending work on invalidation and ignores late completion", async () => {
    const scope = new BoardMediaResourceScope("board:A", 7);
    let complete!: (value: string) => void;
    let signal: AbortSignal | undefined;
    const release = vi.fn();
    const lease = scope.acquire((currentSignal) => {
      signal = currentSignal;
      return {
        promise: new Promise<string>((resolve) => {
          complete = resolve;
        }),
        release,
      };
    });

    expect(scope.snapshot()).toMatchObject({
      boardId: "board:A",
      resourceGeneration: 7,
      activeLeases: 1,
      pendingLeases: 1,
    });

    scope.invalidate();
    await expect(lease.promise).rejects.toMatchObject({ name: "AbortError" });
    complete("late result");
    await Promise.resolve();
    lease.release();
    expect(signal?.aborted).toBe(true);
    expect(release).toHaveBeenCalledOnce();
    expect(scope.snapshot()).toMatchObject({
      resourceGeneration: 8,
      activeLeases: 0,
      pendingLeases: 0,
      readyLeases: 0,
    });
  });

  it("keeps resources on another board alive and releases ready handles once", async () => {
    const a = new BoardMediaResourceScope("board:A");
    const b = new BoardMediaResourceScope("board:B");
    const releaseA = vi.fn();
    const releaseB = vi.fn();
    const first = a.acquire(() => ({
      promise: Promise.resolve("a"),
      release: releaseA,
    }));
    const second = b.acquire(() => ({
      promise: Promise.resolve("b"),
      release: releaseB,
    }));
    await expect(first.promise).resolves.toBe("a");
    await expect(second.promise).resolves.toBe("b");
    expect(b.snapshot()).toMatchObject({ activeLeases: 1, readyLeases: 1 });

    a.dispose();
    a.dispose();
    a.invalidate();
    first.release();
    expect(releaseA).toHaveBeenCalledOnce();
    expect(releaseB).not.toHaveBeenCalled();
    expect(b.snapshot().activeLeases).toBe(1);

    second.release();
    b.dispose();
    expect(releaseB).toHaveBeenCalledOnce();
    expect(b.snapshot()).toMatchObject({
      disposed: true,
      activeLeases: 0,
      pendingLeases: 0,
    });
    expect(() =>
      a.acquire(() => ({
        promise: Promise.resolve("forbidden"),
        release: vi.fn(),
      })),
    ).toThrow("disposed");
  });

  it("releases a failed acquisition and allows a new generation", async () => {
    const scope = new BoardMediaResourceScope("board:one");
    const release = vi.fn();
    const lease = scope.acquire(() => ({
      promise: Promise.reject(new Error("load failed")),
      release,
    }));
    await expect(lease.promise).rejects.toThrow("load failed");
    expect(release).toHaveBeenCalledOnce();
    expect(scope.snapshot().activeLeases).toBe(0);
    scope.invalidate();
    expect(scope.identity).toEqual({
      boardId: "board:one",
      resourceGeneration: 1,
    });
    const next = scope.acquire(() => ({
      promise: Promise.resolve("fresh"),
      release: vi.fn(),
    }));
    await expect(next.promise).resolves.toBe("fresh");
    next.release();
    expect(scope.snapshot().activeLeases).toBe(0);
  });

  it("rejects invalid identities before acquiring resources", () => {
    expect(() => new BoardMediaResourceScope("  ")).toThrow("boardId");
    expect(() => new BoardMediaResourceScope("board", -1)).toThrow(
      "generation",
    );
  });
});
