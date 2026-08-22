import { describe, expect, it } from "vitest";

import frozenDocumentJson from "../../../fixtures/board-document-1.0.json?raw";
import { importTutorBoardDocument } from "../../../../src/modules/document-transfer/public";
import {
  renderBoardSnapshotSvg,
  resolveBoardSnapshotLayout,
} from "../../../../src/modules/document-transfer/snapshot";

function fixtureDocument() {
  const imported = importTutorBoardDocument(frozenDocumentJson);
  if (imported.status !== "ok") {
    throw new Error("Frozen fixture must be readable.");
  }
  return imported.document;
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
      '<rect width="100%" height="100%" fill="#ffffff"/>',
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
});
