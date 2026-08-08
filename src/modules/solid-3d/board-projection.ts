import {
  boardObjectId,
  groupId,
  identityTransform,
  projectSolidPoint,
  type BoardGroup,
  type BoardObject,
  type CommandMetadata,
  type ProjectSolid3DSectionCommand,
  type Solid3DRecord,
  type SolidSectionResult,
} from "../../core/public";

const sectionLineStyle = {
  fill: null,
  opacity: 1,
  stroke: "#8f2f45",
  strokeWidth: 3,
} as const;
const sectionPointStyle = {
  fill: "#8f2f45",
  opacity: 1,
  stroke: "#ffffff",
  strokeWidth: 1,
} as const;

export function createProjectSolid3DSectionCommand(input: {
  readonly metadata: CommandMetadata;
  readonly record: Solid3DRecord;
  readonly section: SolidSectionResult;
  readonly sectionId: string;
  readonly token: string;
  readonly translation: { readonly x: number; readonly y: number };
}): ProjectSolid3DSectionCommand {
  const targetGroupId = groupId(`group:solid-section:${input.token}`);
  const projected = input.section.vertices.map((point) =>
    projectSolidPoint(point, input.record.projection),
  );
  const objects: BoardObject[] = [];
  for (let index = 0; index < projected.length; index += 1) {
    const start = projected[index]!;
    const end = projected[(index + 1) % projected.length]!;
    objects.push({
      end: { x: end.x - start.x, y: end.y - start.y },
      groupId: targetGroupId,
      id: boardObjectId(
        `object:solid-section:${input.token}:edge:${String(index)}`,
      ),
      kind: "drawing.line",
      locked: false,
      position: start,
      rotation: 0,
      scale: { x: 1, y: 1 },
      source: { kind: "user" },
      style: sectionLineStyle,
      visible: true,
    });
    objects.push({
      groupId: targetGroupId,
      id: boardObjectId(
        `object:solid-section:${input.token}:point:${String(index)}`,
      ),
      kind: "drawing.ellipse",
      locked: false,
      position: start,
      radius: { x: 4.5, y: 4.5 },
      rotation: 0,
      scale: { x: 1, y: 1 },
      source: { kind: "user" },
      style: sectionPointStyle,
      visible: true,
    });
  }
  const group: BoardGroup = {
    id: targetGroupId,
    locked: false,
    objectIds: objects.map(({ id }) => id),
    transform: { ...identityTransform, translation: input.translation },
  };
  return {
    ...input.metadata,
    group,
    kind: "core.solid-3d.project-section",
    objects,
    sectionId: input.sectionId,
    solidId: input.record.id,
  };
}
