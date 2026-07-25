import { describe, expect, it } from "vitest";

import {
  checkGeometryImportContract,
  geometryImportGeneratedFiles,
} from "../../scripts/geometry-import-contract-lib.mjs";

describe("Geometry import generated contract", () => {
  it("is reproducible, executable and pure", async () => {
    expect(geometryImportGeneratedFiles).toEqual([
      "src/modules/geometry-import/generated/gir.types.ts",
      "src/modules/geometry-import/generated/gir.validators.mjs",
      "src/modules/geometry-import/generated/gir.validators.d.mts",
    ]);
    await checkGeometryImportContract();
  });
});
