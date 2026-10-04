import { describe, expect, it } from "vitest";

import {
  defaultEraserDiameterPx,
  eraserPreferencesStorageKey,
  readEraserDiameterPx,
  writeEraserDiameterPx,
} from "./public";

describe("eraser preferences", () => {
  it("reads the legacy numeric representation", () => {
    const storage = {
      getItem: (key: string) =>
        key === eraserPreferencesStorageKey ? "48" : null,
    };

    expect(readEraserDiameterPx(storage)).toBe(48);
  });

  it("reads the controller JSON representation", () => {
    const storage = {
      getItem: (key: string) =>
        key === eraserPreferencesStorageKey
          ? JSON.stringify({ diameterPx: 52 })
          : null,
    };

    expect(readEraserDiameterPx(storage)).toBe(52);
  });

  it("writes one canonical JSON representation", () => {
    let stored: string | null = null;
    const storage = {
      setItem: (_key: string, value: string) => {
        stored = value;
      },
    };

    expect(writeEraserDiameterPx(50, storage)).toBe(52);
    expect(stored).toBe(JSON.stringify({ diameterPx: 52 }));
  });

  it("falls back safely for corrupt or unavailable browser storage", () => {
    const corrupt = { getItem: () => "{broken" };
    const unavailable = {
      getItem: () => {
        throw new Error("storage unavailable");
      },
    };
    const unwritable = {
      setItem: () => {
        throw new Error("storage unavailable");
      },
    };

    expect(readEraserDiameterPx(corrupt)).toBe(defaultEraserDiameterPx);
    expect(readEraserDiameterPx(unavailable)).toBe(defaultEraserDiameterPx);
    expect(() => writeEraserDiameterPx(40, unwritable)).not.toThrow();
  });
});
