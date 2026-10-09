import { createContext } from "react";

import type { BoardMediaResourceScope } from "./board-media-resource-scope";

/** Access-authorized media lease owner published by one live board workspace. */
export interface BoardMediaResourceContextValue {
  readonly scope: BoardMediaResourceScope;
  readonly resourceGeneration: number;
  readonly enabled: boolean;
}

export const BoardMediaResourceScopeContext =
  createContext<BoardMediaResourceContextValue | null>(null);
