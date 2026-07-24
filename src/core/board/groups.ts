import type { BoardObjectId, GroupId } from "./identifiers";
import type { Transform2D } from "./primitives";

export interface BoardGroup {
  readonly id: GroupId;
  readonly locked: boolean;
  readonly objectIds: readonly BoardObjectId[];
  readonly transform: Transform2D;
}
