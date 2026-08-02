import http from "node:http";
import process from "node:process";

const port = Number(process.env.MATHPIX_MOCK_PORT ?? "19090");

const server = http.createServer(async (request, response) => {
  if (request.method !== "POST" || request.url !== "/v3/strokes") {
    response.writeHead(404).end();
    return;
  }
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  let body;
  try {
    body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    response.writeHead(400).end();
    return;
  }
  const valid =
    request.headers.app_id === "ci-app-id" &&
    request.headers.app_key === "ci-app-key" &&
    body?.metadata?.improve_mathpix === false &&
    Array.isArray(body?.strokes?.strokes?.x) &&
    Array.isArray(body?.strokes?.strokes?.y);
  if (!valid) {
    response.writeHead(422, { "Content-Type": "application/json" });
    response.end(JSON.stringify({ error: "invalid mock request" }));
    return;
  }
  const result = JSON.stringify({
    confidence: 0.99,
    latex_styled: "\\(x^2+1\\)",
    request_id: "mathpix:ci",
    version: "mock-1",
  });
  response.writeHead(200, {
    "Content-Length": Buffer.byteLength(result),
    "Content-Type": "application/json",
  });
  response.end(result);
});

server.listen(port, "0.0.0.0", () => {
  console.log(JSON.stringify({ event: "mathpix.mock-started", port }));
});

const shutdown = () => server.close(() => process.exit(0));
process.once("SIGINT", shutdown);
process.once("SIGTERM", shutdown);
