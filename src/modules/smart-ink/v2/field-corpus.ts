import type { Vec2 } from "../../../core/public";
import type { SmartInkV2Decision } from "./types";

export const smartInkFieldCorpusSchemaVersion =
  "tutorboard.smart-ink-field-corpus/1.0" as const;

export interface SmartInkFieldCorpusSample {
  readonly createdAt: string;
  readonly decisionStatus: SmartInkV2Decision["status"];
  readonly id: string;
  readonly labelStatus: "unreviewed";
  readonly ordinaryInkProbability: number;
  readonly points: readonly Vec2[];
  readonly selectedKind: SmartInkV2Decision["selectedKind"];
}

export interface SmartInkFieldCorpus {
  readonly samples: readonly SmartInkFieldCorpusSample[];
  readonly schemaVersion: typeof smartInkFieldCorpusSchemaVersion;
}

const defaultMaximumSamples = 256;
const defaultStorageKey = "tutorboard.smart-ink.field-corpus.v1";

function parseStored(value: string | null): SmartInkFieldCorpus {
  if (value === null) {
    return { samples: [], schemaVersion: smartInkFieldCorpusSchemaVersion };
  }
  try {
    const parsed = JSON.parse(value) as Partial<SmartInkFieldCorpus>;
    if (
      parsed.schemaVersion !== smartInkFieldCorpusSchemaVersion ||
      !Array.isArray(parsed.samples)
    ) {
      return { samples: [], schemaVersion: smartInkFieldCorpusSchemaVersion };
    }
    return {
      samples: parsed.samples as readonly SmartInkFieldCorpusSample[],
      schemaVersion: smartInkFieldCorpusSchemaVersion,
    };
  } catch {
    return { samples: [], schemaVersion: smartInkFieldCorpusSchemaVersion };
  }
}

export class SmartInkFieldCorpusRecorder {
  readonly #maximumSamples: number;
  readonly #storage: Pick<Storage, "getItem" | "setItem">;
  readonly #storageKey: string;

  constructor(
    storage: Pick<Storage, "getItem" | "setItem">,
    options: {
      readonly maximumSamples?: number;
      readonly storageKey?: string;
    } = {},
  ) {
    this.#storage = storage;
    this.#maximumSamples = Math.max(
      16,
      Math.min(
        2_048,
        Math.floor(options.maximumSamples ?? defaultMaximumSamples),
      ),
    );
    this.#storageKey = options.storageKey ?? defaultStorageKey;
  }

  read(): SmartInkFieldCorpus {
    return parseStored(this.#storage.getItem(this.#storageKey));
  }

  record(
    points: readonly Vec2[],
    decision: SmartInkV2Decision,
    now: () => Date = () => new Date(),
  ): void {
    const top = decision.scores[0]?.probability ?? 0;
    const second = decision.scores[1]?.probability ?? 0;
    const interesting =
      decision.status !== "accepted" ||
      top - second < 0.12 ||
      decision.snapQuality < 0.72;
    if (!interesting) return;
    const current = this.read();
    const sample: SmartInkFieldCorpusSample = {
      createdAt: now().toISOString(),
      decisionStatus: decision.status,
      id: `field:${crypto.randomUUID()}`,
      labelStatus: "unreviewed",
      ordinaryInkProbability: decision.ordinaryInkProbability,
      points: points.map((point) => ({ ...point })),
      selectedKind: decision.selectedKind,
    };
    const next: SmartInkFieldCorpus = {
      samples: [...current.samples, sample].slice(-this.#maximumSamples),
      schemaVersion: smartInkFieldCorpusSchemaVersion,
    };
    this.#storage.setItem(this.#storageKey, JSON.stringify(next));
  }

  exportJson(): string {
    return JSON.stringify(this.read(), null, 2);
  }
}
