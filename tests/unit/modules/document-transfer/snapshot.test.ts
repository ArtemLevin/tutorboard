import { describe, expect, it } from "vitest";

import frozenDocumentJson from "../../../fixtures/board-document-1.0.json?raw";
import { boardObjectId } from "../../../../src/core/public";
import { importTutorBoardDocument } from "../../../../src/modules/document-transfer/public";
import {
  renderBoardSnapshotSvg,
  resolveBoardSnapshotLayout,
} from "../../../../src/modules/document-transfer/snapshot";
import {
  drawingStyleDefaults,
  reduceDrawingInteraction,
} from "../../../../src/modules/drawing/public";

function fixtureDocument() {
  const imported = importTutorBoardDocument(frozenDocumentJson);
  if (imported.status !== "ok") {
    throw new Error("Frozen fixture must be readable.");
  }
  return imported.document;
}

function fixtureDocumentWithText(options: {
  readonly fill: string | null;
  readonly opacity?: number;
  readonly stroke: string | null;
}) {
  const document = fixtureDocument();
  const objectId = boardObjectId("object:snapshot-text");
  const pointerId = 17;
  const started = reduceDrawingInteraction(
    { kind: "idle" },
    {
      kind: "start",
      objectId,
      point: { x: 48, y: 72 },
      pointerId,
      style: {
        ...drawingStyleDefaults.text,
        fill: options.fill,
        opacity: options.opacity ?? 1,
        stroke: options.stroke,
      },
      text: "Экспорт текста",
      tool: "drawing.text",
    },
  );
  const completed = reduceDrawingInteraction(started.state, {
    kind: "finish",
    point: { x: 48, y: 72 },
    pointerId,
  }).completedObject;
  if (completed === null || completed.kind !== "drawing.text") {
    throw new Error("Text fixture must complete as a drawing.text object.");
  }
  return {
    ...document,
    objects: {
      ...document.objects,
      [objectId]: completed,
    },
    order: [...document.order, objectId],
  };
}

function exportedTextMarkup(svg: string): string {
  const markup = svg.match(/<text\b[^>]*>.*?<\/text>/u)?.[0];
  if (markup === undefined) {
    throw new Error("Snapshot must contain exported text markup.");
  }
  return markup;
}

describe("TutorBoard snapshot layout", () => {
  it("exports the complete board independently of viewport pan and zoom", () => {
    const document = fixtureDocument();
    const displacedViewport = {
      ...document,
      viewport: {
        offset: { x: -12_000, y: 8_000 },
        zoom: 0.08,
      },
    };

    expect(renderBoardSnapshotSvg(displacedViewport)).toBe(
      renderBoardSnapshotSvg(document),
    );
    expect(renderBoardSnapshotSvg(document)).toContain(
      '<rect width="100%" height="100%" fill="#f5f3ee"/>',
    );
    expect(renderBoardSnapshotSvg(document)).toContain(
      'color-interpolation="sRGB" color-interpolation-filters="sRGB"',
    );
    expect(renderBoardSnapshotSvg(document)).not.toContain("#f8fafc");
  });

  it("fits distant negative world coordinates inside the exported frame", () => {
    const document = fixtureDocument();
    const group = Object.values(document.groups)[0];
    if (group === undefined) {
      throw new Error("Fixture must contain a group.");
    }
    const translated = {
      ...document,
      groups: {
        ...document.groups,
        [group.id]: {
          ...group,
          transform: {
            ...group.transform,
            translation: { x: -5_400, y: 3_200 },
          },
        },
      },
    };

    const layout = resolveBoardSnapshotLayout(translated);
    const bounds = layout.contentBounds;
    if (bounds === null) {
      throw new Error("Fixture must have visible content.");
    }

    const left = bounds.left * layout.scale + layout.translation.x;
    const right = bounds.right * layout.scale + layout.translation.x;
    const top = bounds.top * layout.scale + layout.translation.y;
    const bottom = bounds.bottom * layout.scale + layout.translation.y;
    const epsilon = 0.000_001;

    expect(left).toBeGreaterThanOrEqual(layout.padding - epsilon);
    expect(top).toBeGreaterThanOrEqual(layout.padding - epsilon);
    expect(right).toBeLessThanOrEqual(layout.width - layout.padding + epsilon);
    expect(bottom).toBeLessThanOrEqual(
      layout.height - layout.padding + epsilon,
    );
  });

  it("keeps explicitly requested snapshot dimensions", () => {
    const layout = resolveBoardSnapshotLayout(fixtureDocument(), {
      height: 600,
      width: 800,
    });

    expect(layout.width).toBe(800);
    expect(layout.height).toBe(600);
    expect(layout.scale).toBeGreaterThan(0);
  });

  it("renders text with the same stroke-color fallback as the canvas", () => {
    const svg = renderBoardSnapshotSvg(
      fixtureDocumentWithText({
        fill: null,
        opacity: 0.73,
        stroke: "#245d6b",
      }),
    );
    const text = exportedTextMarkup(svg);

    expect(text).toContain('fill="#245d6b"');
    expect(text).toContain('opacity="0.73"');
    expect(text).toContain('stroke="none"');
    expect(text).not.toContain('fill="none"');
    expect(text).not.toContain("stroke-width=");
  });

  it("prefers explicit text fill and preserves the canvas default fallback", () => {
    const filled = exportedTextMarkup(
      renderBoardSnapshotSvg(
        fixtureDocumentWithText({
          fill: "#6d214f",
          stroke: "#245d6b",
        }),
      ),
    );
    const defaulted = exportedTextMarkup(
      renderBoardSnapshotSvg(
        fixtureDocumentWithText({
          fill: null,
          stroke: null,
        }),
      ),
    );

    expect(filled).toContain('fill="#6d214f"');
    expect(defaulted).toContain('fill="#17202a"');
  });
});
