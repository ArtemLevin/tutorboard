import { Group, Rect, Text } from "react-konva";

import type { MediaAssetObject } from "../../core/public";

export function MediaAssetPlaceholderRenderer({
  object,
}: {
  readonly object: MediaAssetObject;
}) {
  return (
    <Group
      name="board-transform-target"
      opacity={object.style.opacity}
      rotation={object.rotation}
      scaleX={object.scale.x}
      scaleY={object.scale.y}
      visible={object.visible}
      x={object.position.x}
      y={object.position.y}
    >
      <Rect
        fill="rgba(148, 163, 184, 0.08)"
        height={object.size.height}
        stroke="#94a3b8"
        strokeWidth={1}
        width={object.size.width}
      />
      <Text
        fill="#475569"
        fontFamily="Inter, ui-sans-serif, system-ui"
        fontSize={16}
        listening={false}
        padding={16}
        text={object.fileName}
        width={object.size.width}
      />
    </Group>
  );
}
