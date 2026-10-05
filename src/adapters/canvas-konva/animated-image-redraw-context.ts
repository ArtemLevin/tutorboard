import { createContext } from "react";

import type { AnimatedImageRedrawCoordinator } from "./animated-image-redraw";

export const AnimatedImageRedrawContext =
  createContext<AnimatedImageRedrawCoordinator | null>(null);
