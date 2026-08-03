import {
  mathInkRecognitionProviders,
  type MathInkRecognitionProvider,
} from "../../modules/handwritten-function/public";

export const formulaRecognitionSettingsSchemaVersion =
  "tutorboard.formula-recognition-settings/1" as const;
export const formulaRecognitionSettingsStorageKey =
  "tutorboard.formula-recognition-settings/1" as const;
export const defaultFormulaRecognitionProvider = "paddleocr" as const;

export interface FormulaRecognitionSettings {
  readonly provider: MathInkRecognitionProvider;
  readonly schemaVersion: typeof formulaRecognitionSettingsSchemaVersion;
}

export interface FormulaRecognitionProviderDescriptor {
  readonly description: string;
  readonly id: MathInkRecognitionProvider;
  readonly label: string;
  readonly location: "cloud" | "local";
  readonly privacy: string;
  readonly profile: string;
  readonly recommended: boolean;
}

export const formulaRecognitionProviderDescriptors: readonly FormulaRecognitionProviderDescriptor[] =
  [
    {
      description:
        "Специализированная модель распознавания формул. Подходит для быстрого локального режима на CPU или GPU.",
      id: "paddleocr",
      label: "PaddleOCR Formula Recognition",
      location: "local",
      privacy: "Изображение формулы остаётся в локальной инфраструктуре.",
      profile: "Минимальная задержка · формульная модель",
      recommended: true,
    },
    {
      description:
        "Локальная мультимодальная модель через OpenAI-совместимый endpoint, включая локальный Ollama gateway.",
      id: "local-ocr-llm",
      label: "Локальная OCR-LLM",
      location: "local",
      privacy:
        "Изображение отправляется только выбранному локальному endpoint.",
      profile: "Гибкая модель · выше требования к памяти",
      recommended: false,
    },
    {
      description:
        "Облачное распознавание математической разметки моделью Yandex Vision OCR math-markdown.",
      id: "yandex-ai-studio",
      label: "Yandex Cloud OCR",
      location: "cloud",
      privacy: "Изображение передаётся в Yandex Cloud через серверный gateway.",
      profile: "Облачная точность · требуется подключение",
      recommended: false,
    },
  ];

const providerSet = new Set<string>(mathInkRecognitionProviders);

function isProvider(value: unknown): value is MathInkRecognitionProvider {
  return typeof value === "string" && providerSet.has(value);
}

function defaultSettings(): FormulaRecognitionSettings {
  return {
    provider: defaultFormulaRecognitionProvider,
    schemaVersion: formulaRecognitionSettingsSchemaVersion,
  };
}

function runtimeStorage(storage: Storage | null | undefined): Storage | null {
  if (storage !== undefined) return storage;
  return typeof window === "undefined" ? null : window.localStorage;
}

export function readFormulaRecognitionSettings(
  storage?: Storage | null,
): FormulaRecognitionSettings {
  const target = runtimeStorage(storage);
  if (target === null) return defaultSettings();
  let serialized: string | null;
  try {
    serialized = target.getItem(formulaRecognitionSettingsStorageKey);
  } catch {
    return defaultSettings();
  }
  if (serialized === null) return defaultSettings();
  try {
    const parsed = JSON.parse(serialized) as unknown;
    if (
      typeof parsed !== "object" ||
      parsed === null ||
      Array.isArray(parsed)
    ) {
      return defaultSettings();
    }
    const record = parsed as Record<string, unknown>;
    if (
      record.schemaVersion !== formulaRecognitionSettingsSchemaVersion ||
      !isProvider(record.provider) ||
      Object.keys(record).some(
        (key) => key !== "provider" && key !== "schemaVersion",
      )
    ) {
      return defaultSettings();
    }
    return {
      provider: record.provider,
      schemaVersion: formulaRecognitionSettingsSchemaVersion,
    };
  } catch {
    return defaultSettings();
  }
}

export function writeFormulaRecognitionSettings(
  provider: MathInkRecognitionProvider,
  storage?: Storage | null,
): FormulaRecognitionSettings {
  if (!isProvider(provider)) {
    throw new TypeError("Unsupported formula recognition provider.");
  }
  const settings: FormulaRecognitionSettings = {
    provider,
    schemaVersion: formulaRecognitionSettingsSchemaVersion,
  };
  const target = runtimeStorage(storage);
  if (target !== null) {
    target.setItem(
      formulaRecognitionSettingsStorageKey,
      JSON.stringify(settings),
    );
  }
  return settings;
}
