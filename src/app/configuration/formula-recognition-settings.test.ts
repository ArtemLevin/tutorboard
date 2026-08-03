import { beforeEach, describe, expect, it } from "vitest";

import {
  defaultFormulaRecognitionProvider,
  formulaRecognitionSettingsSchemaVersion,
  formulaRecognitionSettingsStorageKey,
  readFormulaRecognitionSettings,
  writeFormulaRecognitionSettings,
} from "./formula-recognition-settings";

beforeEach(() => {
  window.localStorage.clear();
});

describe("formula recognition settings", () => {
  it("defaults to local PaddleOCR", () => {
    expect(readFormulaRecognitionSettings()).toEqual({
      provider: defaultFormulaRecognitionProvider,
      schemaVersion: formulaRecognitionSettingsSchemaVersion,
    });
  });

  it("persists a selected provider", () => {
    expect(writeFormulaRecognitionSettings("local-ocr-llm")).toEqual({
      provider: "local-ocr-llm",
      schemaVersion: formulaRecognitionSettingsSchemaVersion,
    });
    expect(readFormulaRecognitionSettings()).toEqual({
      provider: "local-ocr-llm",
      schemaVersion: formulaRecognitionSettingsSchemaVersion,
    });
  });

  it("recovers from malformed and future values", () => {
    window.localStorage.setItem(formulaRecognitionSettingsStorageKey, "{");
    expect(readFormulaRecognitionSettings().provider).toBe("paddleocr");

    window.localStorage.setItem(
      formulaRecognitionSettingsStorageKey,
      JSON.stringify({
        provider: "unknown",
        schemaVersion: formulaRecognitionSettingsSchemaVersion,
      }),
    );
    expect(readFormulaRecognitionSettings().provider).toBe("paddleocr");

    window.localStorage.setItem(
      formulaRecognitionSettingsStorageKey,
      JSON.stringify({
        provider: "yandex-ai-studio",
        schemaVersion: "future",
      }),
    );
    expect(readFormulaRecognitionSettings().provider).toBe("paddleocr");
  });
});
