import type { LocalDocumentAutosave } from "./autosave";

export interface LocalAutosaveLifecycleBinding {
  readonly documentTarget: Pick<
    Document,
    "addEventListener" | "removeEventListener" | "visibilityState"
  >;
  readonly windowTarget: Pick<
    Window,
    "addEventListener" | "removeEventListener"
  >;
}

export function bindLocalAutosaveLifecycleFlush(
  autosave: Pick<LocalDocumentAutosave, "flush">,
  binding: LocalAutosaveLifecycleBinding,
): () => void {
  const flush = () => {
    void autosave.flush();
  };
  const flushWhenHidden = () => {
    if (binding.documentTarget.visibilityState === "hidden") flush();
  };

  binding.documentTarget.addEventListener(
    "visibilitychange",
    flushWhenHidden as EventListener,
  );
  binding.windowTarget.addEventListener("pagehide", flush as EventListener);

  return () => {
    binding.documentTarget.removeEventListener(
      "visibilitychange",
      flushWhenHidden as EventListener,
    );
    binding.windowTarget.removeEventListener(
      "pagehide",
      flush as EventListener,
    );
  };
}
