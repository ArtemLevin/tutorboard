import { readFile, writeFile } from "node:fs/promises";

async function patch(path, transform) {
  const before = await readFile(path, "utf8");
  const after = transform(before);
  if (after === before) throw new Error(`No changes applied to ${path}`);
  await writeFile(path, after, "utf8");
}

function replaceOnce(content, search, replacement, label) {
  const index = content.indexOf(search);
  if (index < 0) throw new Error(`Missing patch anchor: ${label}`);
  if (content.indexOf(search, index + search.length) >= 0) {
    throw new Error(`Ambiguous patch anchor: ${label}`);
  }
  return content.slice(0, index) + replacement + content.slice(index + search.length);
}

await patch("src/adapters/canvas-konva/BoardStage.tsx", (content) => {
  let next = replaceOnce(
    content,
    `  const rightClickCandidateRef = useRef<RightClickCandidate | null>(null);\n  const worldPointerCallbacksRef = useRef({`,
    `  const rightClickCandidateRef = useRef<RightClickCandidate | null>(null);\n  const panModeRequestRef = useRef(onPanModeRequest);\n  const worldPointerCallbacksRef = useRef({`,
    "pan mode request ref",
  );
  next = replaceOnce(
    next,
    `  useEffect(() => {\n    worldPointerCallbacksRef.current = {`,
    `  useEffect(() => {\n    panModeRequestRef.current = onPanModeRequest;\n  }, [onPanModeRequest]);\n\n  useEffect(() => {\n    worldPointerCallbacksRef.current = {`,
    "pan mode request ref synchronization",
  );
  next = replaceOnce(
    next,
    `        rightClickCandidateRef.current = null;\n        onPanModeRequest?.();`,
    `        rightClickCandidateRef.current = null;\n        panModeRequestRef.current?.();`,
    "stable pan mode request callback",
  );
  next = replaceOnce(
    next,
    `    finishSelection,\n    onPanModeRequest,\n    selectionWorldSample,`,
    `    finishSelection,\n    selectionWorldSample,`,
    "pointer effect dependency cleanup",
  );
  return next;
});

await patch("tests/e2e/selection.spec.ts", (content) =>
  replaceOnce(
    content,
    `  await rightDoubleClickAt(page, contour);\n  await expect(\n    page.getByRole("button", { name: "Увеличить выделение на 10%" }),\n  ).toBeVisible();`,
    `  const interior = await stagePoint(page, 350, 250);\n  await rightDoubleClickAt(page, interior);\n  await expect(\n    page.getByRole("button", { name: "Увеличить выделение на 10%" }),\n  ).toBeVisible();`,
    "rectangle interior settings target",
  ),
);

await patch("tests/e2e/stroke-smoothing.spec.ts", (content) => {
  let next = replaceOnce(
    content,
    `import type { Page } from "@playwright/test";`,
    `import type { Page } from "@playwright/test";\nimport { rightDoubleClickAt } from "./coordinate-plot-interaction.js";`,
    "stroke smoothing settings helper import",
  );
  next = replaceOnce(
    next,
    `  await page.getByRole("button", { name: "drawing.pen-stroke" }).click();\n  await expect(page.getByTestId("selection-count")).toHaveText("1 выбрано");\n\n  const zoomPoint = await stagePoint(page, 380, 290);`,
    `  await page.getByRole("button", { name: "drawing.pen-stroke" }).click();\n  await expect(page.getByTestId("selection-count")).toHaveText("1 выбрано");\n  const settingsPoint = await stagePoint(page, 350, 310);\n  await rightDoubleClickAt(page, settingsPoint);\n  await expect(\n    page.getByRole("button", { name: "Увеличить выделение на 10%" }),\n  ).toBeVisible();\n\n  const zoomPoint = await stagePoint(page, 380, 290);`,
    "stroke smoothing explicit settings entry",
  );
  return next;
});

console.log("Applied final right-gesture smoke fixes");
