import { describe, expect, it } from "vitest";

import { boardObjectId, type BoardDocument } from "../../../../src/core/public";
import {
  createSvgObject,
  sanitizeSvg,
  validateStoredSvgDocument,
} from "../../../../src/modules/svg-import/public";
import { emptyDocument } from "../../core/helpers";

const safeSvg = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="-10 0 200 100">
  <defs>
    <linearGradient id="paint"><stop offset="0" stop-color="#335577" /></linearGradient>
  </defs>
  <rect x="0" y="0" width="200" height="100" fill="url(#paint)" />
  <text x="20" y="55">TutorBoard</text>
</svg>`;

describe("safe SVG import", () => {
  it("produces deterministic canonical output and bounded display size", () => {
    const first = sanitizeSvg(safeSvg);
    expect(first.status).toBe("ok");
    if (first.status !== "ok") {
      return;
    }

    const second = sanitizeSvg(first.value.sanitizedSvg);
    expect(second).toEqual(first);
    expect(first.value.viewBox).toEqual({
      height: 100,
      width: 200,
      x: -10,
      y: 0,
    });
    expect(first.value.size).toEqual({ height: 100, width: 200 });
    expect(first.value.sanitizedSvg).not.toContain("<script");
  });

  it.each([
    [
      "script",
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><script>alert(1)</script></svg>',
    ],
    [
      "event handler",
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10" onload="alert(1)"></svg>',
    ],
    [
      "foreignObject",
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><foreignObject /></svg>',
    ],
    [
      "external image",
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><image href="https://example.com/a.png" /></svg>',
    ],
    [
      "style",
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><rect style="fill:url(https://example.com/x)" /></svg>',
    ],
    [
      "doctype",
      '<!DOCTYPE svg><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"></svg>',
    ],
  ])("rejects %s without returning raw input", (_name, source) => {
    const result = sanitizeSvg(source);

    expect(result.status).toBe("error");
    if (result.status === "error") {
      expect(result.diagnostic.code).toMatch(/^svg\./);
      expect(JSON.stringify(result.diagnostic)).not.toContain(source);
    }
  });

  it("creates one centered visual object without GeometryOS provenance", () => {
    const result = createSvgObject({
      center: { x: 300, y: 250 },
      id: boardObjectId("object:svg-safe"),
      source: safeSvg,
    });

    expect(result.status).toBe("ok");
    if (result.status === "ok") {
      expect(result.object.kind).toBe("svg-import.svg");
      expect(result.object.source).toEqual({ kind: "user" });
      expect(result.object.position).toEqual({ x: 200, y: 200 });
      expect(result.object.groupId).toBeNull();
    }
  });

  it("rejects a tampered stored SVG before rendering", () => {
    const created = createSvgObject({
      center: { x: 100, y: 100 },
      id: boardObjectId("object:svg-stored"),
      source: safeSvg,
    });
    expect(created.status).toBe("ok");
    if (created.status !== "ok") {
      return;
    }
    const document: BoardDocument = {
      ...emptyDocument(),
      objects: { [created.object.id]: created.object },
      order: [created.object.id],
    };

    expect(validateStoredSvgDocument(document)).toEqual({ status: "ok" });
    const tampered: BoardDocument = {
      ...document,
      objects: {
        [created.object.id]: {
          ...created.object,
          sanitizedSvg: `${created.object.sanitizedSvg}<script />`,
        },
      },
    };
    expect(validateStoredSvgDocument(tampered)).toMatchObject({
      objectId: created.object.id,
      status: "error",
    });
  });
});
