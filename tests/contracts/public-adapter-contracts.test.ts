import { describe, expect, it } from "vitest";

import {
  canvasAdapterContractVersion,
  type BoardStageProps,
} from "../../src/adapters/canvas-konva/public";
import {
  geometryOsAdapterContractVersion,
  type GeometryOsHttpClientOptions,
} from "../../src/adapters/geometryos-http/public";
import {
  persistenceAdapterContractVersion,
  type DexieBoardDocumentRepository,
} from "../../src/adapters/persistence-dexie/public";
import {
  boardDocumentSchemaVersion,
  type BoardDocumentRepository,
  type GeometryOsClient,
} from "../../src/core/public";

describe("stable public contracts", () => {
  it("pins the document boundary to 1.3 and adapter boundaries to 1.0", () => {
    expect({
      board: boardDocumentSchemaVersion,
      canvas: canvasAdapterContractVersion,
      geometryOs: geometryOsAdapterContractVersion,
      persistence: persistenceAdapterContractVersion,
    }).toEqual({
      board: "1.3",
      canvas: "1.0",
      geometryOs: "1.0",
      persistence: "1.0",
    });
  });

  it("keeps adapter inputs expressed through public core ports/read models", () => {
    const compileTimeContract = {
      canvas: null as BoardStageProps | null,
      geometryClient: null as GeometryOsClient | null,
      geometryOptions: null as GeometryOsHttpClientOptions | null,
      persistenceAdapter: null as DexieBoardDocumentRepository | null,
      persistencePort: null as BoardDocumentRepository | null,
    };

    expect(Object.keys(compileTimeContract).sort()).toEqual([
      "canvas",
      "geometryClient",
      "geometryOptions",
      "persistenceAdapter",
      "persistencePort",
    ]);
  });
});
