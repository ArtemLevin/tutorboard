// @vitest-environment node

import { describe, expect, it } from "vitest";

import { runtimeProviders } from "../../services/math-ink-proxy/server.mjs";

describe("formula recognition runtime provider configuration", () => {
  it("scopes insecure transport to the selected internal provider", () => {
    const providers = runtimeProviders({
      PADDLE_OCR_ALLOW_INSECURE_UPSTREAM: "true",
      PADDLE_OCR_API_TOKEN: "paddle-token",
      PADDLE_OCR_API_URL: "http://paddle-formula:8080/v1/recognize",
      YANDEX_API_KEY: "yandex-key",
      YANDEX_FOLDER_ID: "folder-id",
    });

    expect(providers.paddleocr).toMatchObject({
      allowInsecure: true,
      apiUrl: "http://paddle-formula:8080/v1/recognize",
      token: "paddle-token",
    });
    expect(providers["yandex-ai-studio"]).toMatchObject({
      allowInsecure: false,
      apiUrl: "https://ocr.api.cloud.yandex.net/ocr/v1/recognizeText",
    });
  });

  it("rejects the legacy global insecure-upstream switch", () => {
    expect(() =>
      runtimeProviders({
        FORMULA_RECOGNITION_ALLOW_INSECURE_UPSTREAM: "true",
        PADDLE_OCR_API_URL: "http://paddle-formula:8080/v1/recognize",
      }),
    ).toThrow("provider-specific insecure-upstream setting");
  });

  it("fails startup for insecure or malformed provider URLs", () => {
    expect(() =>
      runtimeProviders({
        PADDLE_OCR_API_URL: "http://paddle-formula:8080/v1/recognize",
      }),
    ).toThrow("PADDLE_OCR_API_URL must use HTTPS");

    expect(() =>
      runtimeProviders({
        YANDEX_API_KEY: "yandex-key",
        YANDEX_FOLDER_ID: "folder-id",
        YANDEX_OCR_API_URL: "http://ocr.example.test/v1/recognize",
      }),
    ).toThrow("YANDEX_OCR_API_URL must use HTTPS");

    expect(() =>
      runtimeProviders({
        LOCAL_OCR_LLM_API_URL: "https://user:secret@localhost/v1/chat",
        LOCAL_OCR_LLM_MODEL: "qwen-vl",
      }),
    ).toThrow("cannot contain credentials");
  });
});
