import { describe, expect, it, vi } from "vitest";

import { bindLocalAutosaveLifecycleFlush } from "../../../../src/modules/local-persistence/public";

class VisibilityTarget extends EventTarget {
  visibilityState: DocumentVisibilityState = "visible";
}

describe("local autosave lifecycle flush", () => {
  it("flushes on hidden visibility and page exit, then detaches cleanly", () => {
    const documentTarget = new VisibilityTarget();
    const windowTarget = new EventTarget();
    const flush = vi.fn(() => Promise.resolve());
    const dispose = bindLocalAutosaveLifecycleFlush(
      { flush },
      {
        documentTarget,
        windowTarget,
      },
    );

    documentTarget.dispatchEvent(new Event("visibilitychange"));
    expect(flush).not.toHaveBeenCalled();

    documentTarget.visibilityState = "hidden";
    documentTarget.dispatchEvent(new Event("visibilitychange"));
    windowTarget.dispatchEvent(new Event("pagehide"));
    expect(flush).toHaveBeenCalledTimes(2);

    dispose();
    documentTarget.dispatchEvent(new Event("visibilitychange"));
    windowTarget.dispatchEvent(new Event("pagehide"));
    expect(flush).toHaveBeenCalledTimes(2);
  });
});
