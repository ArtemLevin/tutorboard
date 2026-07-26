import fs from "node:fs";
import http from "node:http";
import path from "node:path";

const host = "127.0.0.1";
const port = 4180;
const fixtureRoot = path.resolve("contracts/geometryos/fixtures");
const generateSuccess = fs.readFileSync(
  path.join(fixtureRoot, "generate-success.response.json"),
);
const layoutSuccess = fs.readFileSync(
  path.join(fixtureRoot, "layout-success.response.json"),
);
const readinessSuccess = Buffer.from(
  JSON.stringify({
    checks: [
      { name: "lifecycle", status: "pass" },
      { name: "executor", status: "pass" },
    ],
    status: "ready",
  }),
);

function corsHeaders(origin) {
  return {
    "Access-Control-Allow-Headers": "content-type,x-request-id",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Origin": origin ?? "http://127.0.0.1:4173",
    "Access-Control-Expose-Headers": "x-request-id",
  };
}

const server = http.createServer((request, response) => {
  const url = new URL(request.url ?? "/", `http://${host}:${port}`);
  const cors = corsHeaders(request.headers.origin);

  if (url.pathname === "/healthz") {
    response.writeHead(200, { "Content-Type": "text/plain" });
    response.end("ok");
    return;
  }
  if (request.method === "OPTIONS") {
    response.writeHead(204, cors);
    response.end();
    return;
  }

  const requestId = request.headers["x-request-id"];
  if (typeof requestId !== "string") {
    response.writeHead(400, {
      ...cors,
      "Content-Type": "application/problem+json",
    });
    response.end(
      JSON.stringify({
        code: "fixture.request-id-required",
        detail: "X-Request-ID is required.",
        request_id: "fixture-missing-request-id",
        status: 400,
        title: "Request ID required",
        type: "about:blank",
      }),
    );
    return;
  }

  const body =
    request.method === "GET" && url.pathname === "/ready"
      ? readinessSuccess
      : request.method === "POST" && url.pathname === "/api/v1/generate"
        ? generateSuccess
        : request.method === "POST" && url.pathname === "/api/v1/layout"
          ? layoutSuccess
          : null;
  if (body === null) {
    response.writeHead(404, {
      ...cors,
      "Content-Type": "application/json",
      "X-Request-ID": requestId,
    });
    response.end(JSON.stringify({ error: "fixture route not found" }));
    return;
  }

  request.resume();
  response.writeHead(200, {
    ...cors,
    "Content-Length": body.byteLength,
    "Content-Type": "application/json",
    "X-Request-ID": requestId,
  });
  response.end(body);
});

server.listen(port, host);

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    server.close(() => process.exit(0));
  });
}
