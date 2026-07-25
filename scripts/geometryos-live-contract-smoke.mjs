const baseUrl = process.env.GEOMETRYOS_BASE_URL ?? "http://127.0.0.1:18000";
const allowedOrigin =
  process.env.GEOMETRYOS_ALLOWED_ORIGIN ?? "http://localhost:5173";
const deniedOrigin = "https://untrusted.example";
const generateUrl = new URL("/api/v1/generate", baseUrl);

function requireHeader(response, name) {
  const value = response.headers.get(name);
  if (value === null || value.length === 0) {
    throw new Error(`Missing required response header: ${name}`);
  }
  return value;
}

function splitHeader(value) {
  return value
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
}

async function waitForReady() {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(new URL("/ready", baseUrl), {
        signal: AbortSignal.timeout(2_000),
      });
      if (response.status === 200) {
        return;
      }
    } catch {
      // The bounded retry loop handles container startup without logging payloads.
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error("GeometryOS did not become ready within 30 seconds.");
}

async function preflight(origin) {
  return fetch(generateUrl, {
    method: "OPTIONS",
    headers: {
      Origin: origin,
      "Access-Control-Request-Method": "POST",
      "Access-Control-Request-Headers": "content-type,x-request-id",
    },
    signal: AbortSignal.timeout(5_000),
  });
}

await waitForReady();

const allowedPreflight = await preflight(allowedOrigin);
if (allowedPreflight.status !== 200) {
  throw new Error(
    `Allowed CORS preflight returned HTTP ${allowedPreflight.status}.`,
  );
}
if (
  requireHeader(allowedPreflight, "access-control-allow-origin") !==
  allowedOrigin
) {
  throw new Error("Allowed CORS preflight did not echo the exact origin.");
}
const allowedMethods = splitHeader(
  requireHeader(allowedPreflight, "access-control-allow-methods"),
);
if (!allowedMethods.includes("post")) {
  throw new Error("Allowed CORS preflight does not permit POST.");
}
const allowedHeaders = splitHeader(
  requireHeader(allowedPreflight, "access-control-allow-headers"),
);
for (const header of ["content-type", "x-request-id"]) {
  if (!allowedHeaders.includes(header)) {
    throw new Error(`Allowed CORS preflight does not permit ${header}.`);
  }
}
if (allowedPreflight.headers.has("access-control-allow-credentials")) {
  throw new Error("GeometryOS CORS must not permit browser credentials.");
}

const deniedPreflight = await preflight(deniedOrigin);
if (deniedPreflight.status < 400) {
  throw new Error("Untrusted CORS origin was not rejected.");
}
if (deniedPreflight.headers.has("access-control-allow-origin")) {
  throw new Error("Untrusted CORS origin received an allow-origin header.");
}

console.log(
  "GeometryOS protocol smoke passed: readiness and default-deny CORS preflight.",
);
