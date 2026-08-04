import fs from "node:fs";

function replace(path, before, after) {
  const source = fs.readFileSync(path, "utf8");
  if (!source.includes(before)) {
    throw new Error(`Expected fragment missing in ${path}: ${before}`);
  }
  fs.writeFileSync(path, source.replace(before, after));
}

replace(
  "src/modules/clipboard/clipboard.ts",
  `function ownValue<Key extends PropertyKey, Value>(\n  record: Readonly<Partial<Record<Key, Value>>>,\n  key: Key,\n): Value | undefined {\n  return Object.hasOwn(record, key) ? record[key] : undefined;\n}\n`,
  `function ownValue<Key extends PropertyKey, Value>(\n  record: Readonly<Partial<Record<Key, Value>>>,\n  key: Key,\n): Value | undefined {\n  return Object.hasOwn(record, key) ? record[key] : undefined;\n}\n\nfunction copyClipboardObject(object: BoardObject): BoardObject {\n  if (object.kind === "drawing.pen-stroke") {\n    return {\n      ...object,\n      points: object.points.map((point) => ({ ...point })),\n      ...(object.ink === undefined\n        ? {}\n        : {\n            ink: {\n              ...object.ink,\n              centerline: object.ink.centerline.map((segment) => ({\n                control1: { ...segment.control1 },\n                control2: { ...segment.control2 },\n                end: { ...segment.end },\n                start: { ...segment.start },\n              })),\n              samples: object.ink.samples.map((sample) => ({\n                ...sample,\n                point: { ...sample.point },\n              })),\n            },\n          }),\n    };\n  }\n  if (object.kind === "math.coordinate-plot") {\n    return {\n      ...object,\n      definition: copyCoordinatePlotDefinition(object.definition),\n    };\n  }\n  return object;\n}\n`,
);
replace(
  "src/modules/clipboard/clipboard.ts",
  "    return object === undefined ? [] : [object];",
  "    return object === undefined ? [] : [copyClipboardObject(object)];",
);

replace(
  "src/app/App.test.tsx",
  '    expect(screen.getByText("BoardDocument 1.1")).toBeInTheDocument();',
  '    expect(screen.getByText("BoardDocument 1.2")).toBeInTheDocument();',
);

replace(
  "tests/contracts/public-adapter-contracts.test.ts",
  '  it("pins the document boundary to 1.1 and adapter boundaries to 1.0", () => {',
  '  it("pins the document boundary to 1.2 and adapter boundaries to 1.0", () => {',
);
replace(
  "tests/contracts/public-adapter-contracts.test.ts",
  '      board: "1.1",',
  '      board: "1.2",',
);

replace(
  "tests/unit/adapters/canvas-konva/default-renderers.test.tsx",
  'import { Ellipse, Group, Line, Rect } from "react-konva";',
  'import { Ellipse, Group, Path, Rect } from "react-konva";',
);
replace(
  "tests/unit/adapters/canvas-konva/default-renderers.test.tsx",
  `    expect(fill?.type).toBe(Line);\n    expect(fill?.props).toMatchObject({ listening: false });\n    expect(contour?.type).toBe(Line);\n    expect(contour?.props).toMatchObject({\n      fillEnabled: false,\n      hitStrokeWidth: 14,\n    });`,
  `    expect(fill?.type).toBe(Path);\n    expect(fill?.props).toMatchObject({ listening: false });\n    expect(contour?.type).toBe(Path);\n    expect(contour?.props).toMatchObject({ fill: "#2c7182" });\n    expect(contour?.props.listening).not.toBe(false);`,
);
