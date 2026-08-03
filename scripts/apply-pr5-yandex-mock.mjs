import { readFile, writeFile } from "node:fs/promises";

async function replace(path, before, after) {
  const source = await readFile(path, "utf8");
  if (!source.includes(before)) throw new Error(`Missing anchor in ${path}`);
  await writeFile(path, source.replace(before, after));
}

await replace(
  "services/math-ink-proxy/service.mjs",
  '    url: providerUrl(\n      config.apiUrl ?? "https://ocr.api.cloud.yandex.net/ocr/v1/recognizeText",\n      { allowedHost: "ocr.api.cloud.yandex.net" },\n    ),',
  '    url: providerUrl(\n      config.apiUrl ?? "https://ocr.api.cloud.yandex.net/ocr/v1/recognizeText",\n      config.allowInsecure === true\n        ? { allowInsecure: true }\n        : { allowedHost: "ocr.api.cloud.yandex.net" },\n    ),',
);

await replace(
  "services/math-ink-proxy/server.mjs",
  '          "yandex-ai-studio": {\n            apiKey: yandexApiKey,',
  '          "yandex-ai-studio": {\n            allowInsecure,\n            apiKey: yandexApiKey,',
);
