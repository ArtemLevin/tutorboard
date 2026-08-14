import type { MathInkRecognizer } from "../../modules/handwritten-function/public";

export interface AppPersistenceStatus {
  readonly detail?: string;
  readonly kind:
    "conflict" | "error" | "idle" | "saved" | "saving" | "scheduled";
  readonly label: string;
  readonly retryable?: boolean;
}

export type { MathInkRecognizer };
