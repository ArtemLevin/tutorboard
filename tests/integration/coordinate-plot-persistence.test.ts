import "fake-indexeddb/auto";

import Dexie from "dexie";
import { afterEach, describe, expect, it } from "vitest";

import { DexieBoardDocumentRepository } from "../../src/adapters/persistence-dexie/public";
import {
  boardObjectId,
  persistenceOperationId,
  type BoardDocument,
} from "../../src/core/public";
import { createCoordinatePlotProductionDocument } from "../fixtures/coordinate-plot-production";

const openRepositories: DexieBoardDocumentRepository[] = [];
const openDatabases: Dexie[] = [];

function repositoryName(testName: string): string {
  return `coordinate-plot-release-${testName}-${crypto.randomUUID()}`;
}

function createRepository(name: string): DexieBoardDocumentRepository {
  const repository = new DexieBoardDocumentRepository(name);
  openRepositories.push(repository);
  return repository;
}

function changedCoordinatePlotDocument(document: BoardDocument): BoardDocument {
  const objectId = boardObjectId("release-plot:0");
  const object = document.objects[objectId];
  if (object?.kind !== "math.coordinate-plot") {
    throw new Error("Release coordinate plot fixture is missing.");
  }
  const explicit = object.definition.series[0];
  if (explicit?.kind !== "explicit") {
    throw new Error("Expected the first release series to be explicit.");
  }
  return {
    ...document,
    objects: {
      ...document.objects,
      [objectId]: {
        ...object,
        definition: {
          ...object.definition,
          coordinateViewport: {
            ...object.definition.coordinateViewport,
            equalScale: false,
            xMax: 24,
            xMin: -18,
            yMax: 11,
            yMin: -9,
          },
          legend: { position: "bottom-right", visible: false },
          parameters: object.definition.parameters.map((parameter) =>
            parameter.name === "a" ? { ...parameter, value: 3.25 } : parameter,
          ),
          series: [
            { ...explicit, expression: "a*x^2+b*x-4", visible: false },
            ...object.definition.series.slice(1),
          ],
        },
      },
    },
    updatedAt: "2026-08-01T08:01:00.000Z",
  };
}

afterEach(async () => {
  for (const database of openDatabases.splice(0)) database.close();
  for (const repository of openRepositories.splice(0)) {
    await repository.deleteDatabase();
    repository.close();
  }
});

describe("coordinate plot IndexedDB production lifecycle", () => {
  it("round-trips the complete definition through immutable local revisions", async () => {
    const repository = createRepository(repositoryName("round-trip"));
    const initial = createCoordinatePlotProductionDocument(1);
    const first = await repository.save({
      document: initial,
      expectedRevisionId: null,
      operationId: persistenceOperationId("release-save:1"),
      savedAt: "2026-08-01T08:00:00.000Z",
    });
    expect(first.status).toBe("saved");
    if (first.status !== "saved") throw new Error(first.status);

    const changed = changedCoordinatePlotDocument(initial);
    const second = await repository.save({
      document: changed,
      expectedRevisionId: first.revisionId,
      operationId: persistenceOperationId("release-save:2"),
      savedAt: "2026-08-01T08:01:00.000Z",
    });
    expect(second.status).toBe("saved");

    const loaded = await repository.load(changed.id);
    expect(loaded.status).toBe("restored");
    if (loaded.status !== "restored") throw new Error(loaded.status);
    expect(loaded.document).toEqual(changed);
    const restoredPlot =
      loaded.document.objects[boardObjectId("release-plot:0")];
    expect(restoredPlot).toMatchObject({
      definition: {
        coordinateViewport: {
          equalScale: false,
          xMax: 24,
          xMin: -18,
          yMax: 11,
          yMin: -9,
        },
        legend: { position: "bottom-right", visible: false },
      },
      kind: "math.coordinate-plot",
    });
  });

  it("falls back to the previous valid plot revision and retains diagnostics", async () => {
    const name = repositoryName("recovery");
    const repository = createRepository(name);
    const initial = createCoordinatePlotProductionDocument(1);
    const first = await repository.save({
      document: initial,
      expectedRevisionId: null,
      operationId: persistenceOperationId("release-recovery:1"),
      savedAt: "2026-08-01T08:00:00.000Z",
    });
    expect(first.status).toBe("saved");
    if (first.status !== "saved") throw new Error(first.status);

    const changed = changedCoordinatePlotDocument(initial);
    const second = await repository.save({
      document: changed,
      expectedRevisionId: first.revisionId,
      operationId: persistenceOperationId("release-recovery:2"),
      savedAt: "2026-08-01T08:01:00.000Z",
    });
    expect(second.status).toBe("saved");
    if (second.status !== "saved") throw new Error(second.status);

    const tamper = new Dexie(name);
    tamper.version(1).stores({
      documents: "documentId",
      recoveries: "documentId",
      revisions:
        "revisionId,&operationId,documentId,[documentId+sequence],savedAt",
    });
    openDatabases.push(tamper);
    await tamper.table("revisions").update(second.revisionId, {
      serializedDocument: "{corrupt-coordinate-plot",
    });

    const loaded = await repository.load(initial.id);
    expect(loaded.status).toBe("recovered");
    if (loaded.status !== "recovered") throw new Error(loaded.status);
    expect(loaded.document).toEqual(initial);
    expect(loaded.recovery).toMatchObject({
      failedRevisionId: second.revisionId,
      reason: "invalid-json",
    });

    const diagnostics = await repository.diagnose(
      initial.id,
      "2026-08-01T08:02:00.000Z",
    );
    expect(diagnostics.recovery).toMatchObject({
      failedRevisionId: second.revisionId,
      raw: "{corrupt-coordinate-plot",
      reason: "invalid-json",
    });
    expect(diagnostics.revisions).toHaveLength(2);
  });
});
