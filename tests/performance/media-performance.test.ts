import "fake-indexeddb/auto";

import { DexieBoardDocumentRepository } from "../../src/adapters/persistence-dexie/public";
import { describe, expect, it } from "vitest";

import {
  persistenceOperationId,
  serializeBoardDocument,
  type BoardDocument,
  type LocalRevisionId,
  type EmbeddedImageObject,
} from "../../src/core/public";
import { createMediaPerformanceDocument } from "../fixtures/media-performance";

const payloadCharactersPerImage = 256 * 1024;
const sampleCount = 5;
const broadCiSerializationBudgetMs = 5_000;

function syntheticPngDataUrl(payloadCharacters: number): string {
  return `data:image/png;base64,${"A".repeat(payloadCharacters)}`;
}

function withSyntheticPayloads(
  document: BoardDocument,
  payloadCharacters: number,
): BoardDocument {
  let objects = document.objects;
  for (const id of document.order) {
    const object = document.objects[id];
    if (object === undefined) {
      throw new Error(`Missing fixture object ${id}`);
    }
    if (object.kind !== "image.embedded") continue;

    const image: EmbeddedImageObject = {
      ...object,
      dataUrl: syntheticPngDataUrl(payloadCharacters),
      mimeType: "image/png",
    };
    objects = { ...objects, [id]: image };
  }
  return { ...document, objects };
}

function storedRevisionBytes(value: unknown): number {
  if (
    typeof value !== "object" ||
    value === null ||
    !("serializedDocument" in value) ||
    typeof value.serializedDocument !== "string"
  ) {
    throw new Error("Expected a serialized local revision.");
  }
  return new TextEncoder().encode(value.serializedDocument).byteLength;
}

function median(values: readonly number[]): number {
  const ordered = [...values].sort((left, right) => left - right);
  return ordered[Math.floor(ordered.length / 2)] ?? 0;
}

function measureSerialization(document: BoardDocument) {
  const durations: number[] = [];
  let serializedBytes = 0;
  for (let sample = 0; sample < sampleCount; sample += 1) {
    const startedAt = performance.now();
    const result = serializeBoardDocument(document);
    durations.push(performance.now() - startedAt);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.issues[0]?.message);
    serializedBytes = new TextEncoder().encode(result.json).byteLength;
  }
  return {
    medianMs: median(durations),
    serializedBytes,
  };
}

describe("embedded media serialization baseline", () => {
  it("records byte and serialization growth for 1/5/10 embedded images", () => {
    const metrics = [1, 5, 10].map((imageCount) => {
      const document = withSyntheticPayloads(
        createMediaPerformanceDocument({ staticCount: imageCount }),
        payloadCharactersPerImage,
      );
      return {
        imageCount,
        ...measureSerialization(document),
      };
    });

    expect(metrics[1]!.serializedBytes).toBeGreaterThan(
      metrics[0]!.serializedBytes * 4.5,
    );
    expect(metrics[2]!.serializedBytes).toBeGreaterThan(
      metrics[1]!.serializedBytes * 1.9,
    );
    for (const metric of metrics) {
      expect(metric.medianMs).toBeLessThan(broadCiSerializationBudgetMs);
    }

    console.info(
      "MEDIA_SERIALIZATION_BASELINE",
      JSON.stringify({
        payloadCharactersPerImage,
        samples: sampleCount,
        metrics,
      }),
    );
  });

  it("records actual Dexie revision amplification and save duration", async () => {
    const repository = new DexieBoardDocumentRepository(
      `tutorboard-media-performance-${crypto.randomUUID()}`,
    );
    try {
      const document = withSyntheticPayloads(
        createMediaPerformanceDocument({ staticCount: 5 }),
        payloadCharactersPerImage,
      );
      let expectedRevisionId: LocalRevisionId | null = null;
      const saveDurationsMs: number[] = [];
      for (let index = 0; index < 6; index += 1) {
        const savedAt = `2026-10-04T18:${String(30 + index).padStart(2, "0")}:00.000Z`;
        const revision = {
          ...document,
          title: `Persisted media revision ${index}`,
          updatedAt: savedAt,
        };
        const startedAt = performance.now();
        const result = await repository.save({
          document: revision,
          expectedRevisionId,
          operationId: persistenceOperationId(
            `operation:media-performance:${index}`,
          ),
          savedAt,
        });
        saveDurationsMs.push(performance.now() - startedAt);
        expect(result.status).toBe("saved");
        if (result.status !== "saved") {
          throw new Error(`Unexpected save result: ${result.status}`);
        }
        expectedRevisionId = result.revisionId;
      }

      const diagnostics = await repository.diagnose(
        document.id,
        "2026-10-04T19:00:00.000Z",
      );
      const revisionBytes = diagnostics.revisions.map(storedRevisionBytes);
      const cumulativeBytes = revisionBytes.reduce(
        (sum, bytes) => sum + bytes,
        0,
      );

      expect(revisionBytes).toHaveLength(6);
      expect(cumulativeBytes).toBeGreaterThan(revisionBytes[0]! * 5.9);
      expect(median(saveDurationsMs)).toBeLessThan(
        broadCiSerializationBudgetMs,
      );
      console.info(
        "MEDIA_DEXIE_REVISION_BASELINE",
        JSON.stringify({
          cumulativeBytes,
          medianSaveMs: median(saveDurationsMs),
          revisionBytes,
          revisionCount: revisionBytes.length,
        }),
      );
    } finally {
      await repository.deleteDatabase();
    }
  });

  it("records full-document revision byte amplification", () => {
    const document = withSyntheticPayloads(
      createMediaPerformanceDocument({ staticCount: 5 }),
      payloadCharactersPerImage,
    );
    const revisions = Array.from({ length: 6 }, (_value, index) => ({
      ...document,
      title: `Media performance revision ${index}`,
      updatedAt: `2026-10-04T18:${String(30 + index).padStart(2, "0")}:00.000Z`,
    }));

    const serializedBytes = revisions.map((revision) => {
      const result = serializeBoardDocument(revision);
      expect(result.ok).toBe(true);
      if (!result.ok) throw new Error(result.issues[0]?.message);
      return new TextEncoder().encode(result.json).byteLength;
    });
    const first = serializedBytes[0]!;
    const cumulative = serializedBytes.reduce((sum, bytes) => sum + bytes, 0);

    expect(cumulative).toBeGreaterThan(first * 5.9);
    console.info(
      "MEDIA_REVISION_AMPLIFICATION_BASELINE",
      JSON.stringify({
        cumulativeBytes: cumulative,
        revisionBytes: serializedBytes,
        revisionCount: revisions.length,
      }),
    );
  });
});
