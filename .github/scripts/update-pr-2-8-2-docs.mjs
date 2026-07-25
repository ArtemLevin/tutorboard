import fs from "node:fs";

function replaceOnce(filePath, before, after) {
  const source = fs.readFileSync(filePath, "utf8");
  const occurrences = source.split(before).length - 1;
  if (occurrences !== 1) {
    throw new Error(
      `${filePath}: expected one documentation marker, received ${occurrences}`,
    );
  }
  fs.writeFileSync(filePath, source.replace(before, after));
}

replaceOnce(
  "PLAN.md",
  `| PR 2.8   | завершён | pinned/generated GeometryOS client, runtime validators и bounded HTTP adapter                            |
| PR 2.8.1 | смёржен  | producer repin на \`49e98394d0c9cdeaf7fdaf45b712dbee3a04a74c\`, новый OpenAPI/fixtures и live-contract job |`,
  `| PR 2.8   | завершён | pinned/generated GeometryOS client, runtime validators и bounded HTTP adapter                            |
| PR 2.8.1 | смёржен  | producer repin на \`49e98394d0c9cdeaf7fdaf45b712dbee3a04a74c\`, новый OpenAPI/fixtures и live-contract job |
| PR 2.8.2 | завершён | executable ESM validators, plain-Node smoke и real Chromium CORS/request-ID/runtime gate                 |`,
);

replaceOnce(
  "PLAN.md",
  `1. **Live GeometryOS gate ещё не зелёный.** В финальном pull-request run PR 2.8.1
   обычные Quality gate и Browser smoke прошли, но новый job
   \`GeometryOS live browser contract\` завершился ошибкой. До зелёного запуска
   нельзя считать доказанным реальный browser flow CORS/request correlation.
2. **GeometryOS не публикует Layout Document 0.1.** API v1 возвращает canonical
   GIR и SVG/TikZ, но не версионированные координаты с provenance. SVG не может
   использоваться как semantic source согласно \`GEO-009\`.
3. **GeometryOS client ещё не скомпонован с UI.** HTTP adapter существует, но
   prompt flow, clarification UI, retry identity и atomic import появятся только
   в следующих PR.
4. **Общий vertical slice не закрыт.** Цепочка
   \`text → GIR → Layout Document → BoardDocument → canvas\` пока не доказана.`,
  `1. **GeometryOS не публикует Layout Document 0.1.** API v1 возвращает canonical
   GIR и SVG/TikZ, но не версионированные координаты с provenance. SVG не может
   использоваться как semantic source согласно \`GEO-009\`.
2. **GeometryOS client ещё не скомпонован с UI.** HTTP adapter существует, но
   prompt flow, clarification UI, retry identity и atomic import появятся только
   в следующих PR.
3. **Общий vertical slice не закрыт.** Цепочка
   \`text → GIR → Layout Document → BoardDocument → canvas\` пока не доказана.`,
);

replaceOnce(
  "PLAN.md",
  `#### TutorBoard PR 2.8.2 — восстановить зелёный live-contract gate

Scope:

- воспроизвести и исправить причину падения pinned-container smoke;
- сохранить exact producer commit и default-deny CORS policy;
- проверить allowed preflight, denied origin, отсутствие credentials,
  browser-visible \`X-Request-ID\` и runtime validation ответа;
- не менять BoardDocument, canvas, UI и geometry import contracts.

Exit criteria:

- Quality gate, Browser smoke и GeometryOS live browser contract зелёные;
- diagnostics не содержат prompt, response body или credentials;
- normal CI не обращается к mutable GeometryOS branch.`,
  `#### TutorBoard PR 2.8.2 — восстановить зелёный live-contract gate — завершён

Доставлено:

- Ajv standalone output fail-closed нормализуется в executable ESM на границе
  генератора, а неизвестные CommonJS runtime helpers отклоняются;
- exact Ajv version одинакова в root и isolated code-generation toolchain;
- committed validators воспроизводимо проверяются plain Node ESM loader и
  положительными/отрицательными contract fixtures;
- отдельный protocol probe проверяет readiness, allowed/denied CORS preflight и
  отсутствие credentials;
- реальный Chromium выполняет cross-origin POST, читает exposed
  \`X-Request-ID\` и валидирует live response тем же generated validator;
- exact producer commit и hardened read-only container сохранены;
- Quality gate, Browser smoke и GeometryOS live browser contract прошли в CI
  run 149; diagnostics не содержат prompt, response body или credentials;
- BoardDocument, canvas, UI, persistence и geometry import contracts не менялись.`,
);

replaceOnce(
  "PLAN.md",
  `- PR 2.8.2 блокирует live UI integration, но не чистую документацию и анализ.
- TutorBoard PR 2.9A может идти параллельно с GeometryOS G-10, поскольку не`,
  `- PR 2.8.2 закрыт; следующий TutorBoard owner — pure semantic PR 2.9A.
- TutorBoard PR 2.9A может идти параллельно с GeometryOS G-10, поскольку не`,
);

replaceOnce(
  "PLAN.md",
  `- live GeometryOS browser contract не зелёный;
- Layout Document не versioned и runtime-validated;`,
  `- Layout Document не versioned и runtime-validated;`,
);

replaceOnce(
  "docs/architecture/GEOMETRYOS_CLIENT.md",
  `TutorBoard pins the GeometryOS OpenAPI, GIR schema and consumer fixture manifest by source commit and SHA-256. Compile-time DTOs and standalone runtime validators are generated from that same OpenAPI artifact. External DTOs remain private to \`adapters/geometryos-http\`; the rest of TutorBoard consumes the platform-neutral \`GeometryOsClient\` port from \`core\`.`,
  `TutorBoard pins the GeometryOS OpenAPI, GIR schema and consumer fixture manifest by source commit and SHA-256. Compile-time DTOs and standalone runtime validators are generated from that same OpenAPI artifact. External DTOs remain private to \`adapters/geometryos-http\`; the rest of TutorBoard consumes the platform-neutral \`GeometryOsClient\` port from \`core\`.

Ajv standalone output is normalized at the generator boundary into executable ESM. Only explicitly supported runtime helpers may be bridged; unknown CommonJS markers fail generation. Root and isolated code-generation toolchains must pin the same exact Ajv version.`,
);

replaceOnce(
  "docs/architecture/GEOMETRYOS_CLIENT.md",
  `The committed OpenAPI now declares request and response \`X-Request-ID\` contracts and typed generate \`503\` Problem Details. CI additionally builds the exact producer commit and proves allowed/denied CORS preflight, non-credentialed browser access, exposed request correlation and runtime response validation.`,
  `The committed OpenAPI declares request and response \`X-Request-ID\` contracts and typed generate \`503\` Problem Details. CI imports and executes the raw generated validator with the plain Node ESM loader, then builds the exact producer commit and proves allowed/denied CORS preflight. A separate Chromium probe performs the real cross-origin request, reads the exposed request correlation header and validates the live response with the same generated validator.`,
);

replaceOnce(
  "docs/architecture/GEOMETRYOS_CLIENT.md",
  `The adapter and live smoke never log prompts, response bodies or credential-bearing URLs. Base URLs cannot include credentials, query strings or fragments. Response bodies are streamed through a byte limit before decoding. Generated validators are compiled at build time; the browser does not dynamically compile schemas. The CI container receives only a non-secret exact development origin.`,
  `The adapter and live probes never log prompts, response bodies or credential-bearing URLs. Base URLs cannot include credentials, query strings or fragments. Response bodies are streamed through a byte limit before decoding. Generated validators are compiled at build time; the browser does not dynamically compile schemas. Playwright traces are disabled for the live probe, and its diagnostics contain only safe codes, status, schema paths and correlation metadata. The CI container receives only a non-secret exact development origin.`,
);

replaceOnce(
  "docs/adr/ADR-006-geometryos-generated-client.md",
  `Vendor immutable GeometryOS artifacts, generate TypeScript DTOs with the same pinned \`openapi-typescript\` version used by the producer contract smoke, and generate Ajv 2020 standalone validators from the same OpenAPI document. Keep all generated DTOs private to \`adapters/geometryos-http\` and expose only a normalized \`GeometryOsClient\` port from \`core\`.

The adapter performs no automatic retry`,
  `Vendor immutable GeometryOS artifacts, generate TypeScript DTOs with the same pinned \`openapi-typescript\` version used by the producer contract smoke, and generate Ajv 2020 standalone validators from the same OpenAPI document. Keep all generated DTOs private to \`adapters/geometryos-http\` and expose only a normalized \`GeometryOsClient\` port from \`core\`.

Normalize standalone validator output at generation time into executable ESM. Allow only explicitly supported Ajv runtime helpers through a generated local bridge, reject remaining CommonJS markers, require exact Ajv version parity and execute the committed module through plain Node and Chromium gates.

The adapter performs no automatic retry`,
);

replaceOnce(
  "docs/adr/ADR-006-geometryos-generated-client.md",
  `- generated validator output is committed and reproducibility-checked;
- OpenAPI request/response`,
  `- generated validator output is committed, reproducibility-checked and directly executed by the plain Node ESM loader;
- unknown Ajv runtime helpers or residual CommonJS markers fail generation instead of relying on bundler interop;
- OpenAPI request/response`,
);

fs.rmSync(".github/scripts/update-pr-2-8-2-docs.mjs");
fs.rmSync(".github/workflows/update-pr-2-8-2-docs.yml");
