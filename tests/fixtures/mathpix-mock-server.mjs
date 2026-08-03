import http from "node:http";
import process from "node:process";

const port = Number(process.env.FORMULA_RECOGNITION_MOCK_PORT ?? "19090");

function json(response, status, value) {
  const encoded = JSON.stringify(value);
  response.writeHead(status, {
    "Content-Length": Buffer.byteLength(encoded),
    "Content-Type": "application/json",
  });
  response.end(encoded);
}

async function readJson(request) {
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

const server = http.createServer(async (request, response) => {
  if (request.method === "GET" && request.url === "/healthz") {
    json(response, 200, { status: "ok" });
    return;
  }
  if (request.method !== "POST") {
    response.writeHead(404).end();
    return;
  }
  let body;
  try {
    body = await readJson(request);
  } catch {
    response.writeHead(400).end();
    return;
  }

  if (request.url === "/paddle/v1/recognize") {
    if (
      body?.mimeType !== "image/png" ||
      typeof body?.imageBase64 !== "string"
    ) {
      json(response, 422, { error: "invalid paddle request" });
      return;
    }
    json(response, 200, {
      confidence: 0.99,
      latex: "\\(x^2+1\\)",
      modelVersion: "PP-FormulaNet-S-mock",
      requestId: "paddle:ci",
    });
    return;
  }

  if (request.url === "/openai/v1/chat/completions") {
    const content = body?.messages?.[1]?.content;
    const image = Array.isArray(content)
      ? content.find((item) => item?.type === "image_url")
      : null;
    if (
      request.headers.authorization !== "Bearer ci-local-key" ||
      body?.model !== "ci-local-vlm" ||
      typeof image?.image_url?.url !== "string" ||
      !image.image_url.url.startsWith("data:image/png;base64,")
    ) {
      json(response, 422, { error: "invalid local VLM request" });
      return;
    }
    json(response, 200, {
      choices: [{ message: { content: "```latex\nx^2+1\n```" } }],
      id: "local:ci",
      model: "ci-local-vlm",
    });
    return;
  }

  if (request.url === "/yandex/ocr/v1/recognizeText") {
    if (
      request.headers.authorization !== "Api-Key ci-yandex-key" ||
      request.headers["x-folder-id"] !== "ci-folder" ||
      request.headers["x-data-logging-enabled"] !== "false" ||
      body?.mimeType !== "image/png" ||
      body?.model !== "math-markdown" ||
      typeof body?.content !== "string"
    ) {
      json(response, 422, { error: "invalid Yandex OCR request" });
      return;
    }
    json(response, 200, {
      modelVersion: "math-markdown-mock",
      requestId: "yandex:ci",
      result: { textAnnotation: { fullText: "$$x^2+1$$" } },
    });
    return;
  }

  response.writeHead(404).end();
});

server.listen(port, "0.0.0.0", () => {
  console.log(
    JSON.stringify({ event: "formula-recognition.mock-started", port }),
  );
});

const shutdown = () => server.close(() => process.exit(0));
process.once("SIGINT", shutdown);
process.once("SIGTERM", shutdown);
