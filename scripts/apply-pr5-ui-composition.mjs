import { readFile, writeFile } from "node:fs/promises";

async function patch(path, transform) {
  const source = await readFile(path, "utf8");
  const result = transform(source);
  if (result === source) throw new Error(`No change produced for ${path}`);
  await writeFile(path, result);
}

function replaceOnce(source, before, after, label) {
  const index = source.indexOf(before);
  if (index < 0) throw new Error(`Missing ${label}`);
  if (source.indexOf(before, index + before.length) >= 0) {
    throw new Error(`Repeated ${label}`);
  }
  return source.slice(0, index) + after + source.slice(index + before.length);
}

await patch("src/app/ProductShell.tsx", (initial) => {
  let source = replaceOnce(
    initial,
    'import type { MathInkRecognizer } from "../modules/handwritten-function/public";',
    'import type {\n  MathInkRecognitionProvider,\n  MathInkRecognizer,\n} from "../modules/handwritten-function/public";',
    "math ink type import",
  );
  source = replaceOnce(
    source,
    'import type { AppEnvironment } from "./configuration/environment";',
    'import { FormulaRecognitionSettingsPanel } from "./FormulaRecognitionSettingsPanel";\nimport {\n  readFormulaRecognitionSettings,\n  writeFormulaRecognitionSettings,\n} from "./configuration/formula-recognition-settings";\nimport type { AppEnvironment } from "./configuration/environment";',
    "configuration import",
  );
  source = replaceOnce(
    source,
    '  readonly mathInkRecognizer?: MathInkRecognizer | undefined;',
    '  readonly mathInkRecognizers?:\n    | Readonly<Partial<Record<MathInkRecognitionProvider, MathInkRecognizer>>>\n    | undefined;',
    "ProductShell recognizer prop",
  );

  const settingsStart = source.indexOf("function SettingsPage({");
  const settingsEnd = source.indexOf("function DiagnosticsPage({", settingsStart);
  if (settingsStart < 0 || settingsEnd < 0) throw new Error("SettingsPage boundary missing");
  const settings = `function SettingsPage({\n  environment,\n  onProviderChange,\n  recognizers,\n  selectedProvider,\n}: {\n  readonly environment: AppEnvironment;\n  readonly onProviderChange: (provider: MathInkRecognitionProvider) => void;\n  readonly recognizers: Readonly<\n    Partial<Record<MathInkRecognitionProvider, MathInkRecognizer>>\n  >;\n  readonly selectedProvider: MathInkRecognitionProvider;\n}) {\n  const reducedMotion = window.matchMedia(\n    "(prefers-reduced-motion: reduce)",\n  ).matches;\n  return (\n    <main className="product-page settings-page" tabIndex={-1}>\n      <header>\n        <p className="product-eyebrow">Локальная конфигурация</p>\n        <h1>Настройки</h1>\n        <p>Пользовательские настройки применяются к этой установке браузера.</p>\n      </header>\n      <FormulaRecognitionSettingsPanel\n        onProviderChange={onProviderChange}\n        recognizers={recognizers}\n        selectedProvider={selectedProvider}\n      />\n      <section aria-labelledby="feature-title">\n        <h2 id="feature-title">Возможности сборки</h2>\n        <dl className="settings-list">\n          {Object.entries(environment.features).map(([name, enabled]) => (\n            <div key={name}>\n              <dt>{name}</dt>\n              <dd>{enabled ? "Включено" : "Выключено"}</dd>\n            </div>\n          ))}\n          <div>\n            <dt>reducedMotion</dt>\n            <dd>{reducedMotion ? "Предпочтительно" : "Обычно"}</dd>\n          </div>\n        </dl>\n      </section>\n    </main>\n  );\n}\n\n`;
  source = source.slice(0, settingsStart) + settings + source.slice(settingsEnd);
  source = replaceOnce(
    source,
    "  mathInkRecognizer,\n  repository,",
    "  mathInkRecognizers = {},\n  repository,",
    "ProductShell destructuring",
  );
  source = replaceOnce(
    source,
    "  const [notifications, setNotifications] = useState<\n    readonly NotificationRecord[]\n  >([]);",
    "  const [notifications, setNotifications] = useState<\n    readonly NotificationRecord[]\n  >([]);\n  const [selectedFormulaRecognitionProvider, setSelectedFormulaRecognitionProvider] =\n    useState<MathInkRecognitionProvider>(\n      () => readFormulaRecognitionSettings().provider,\n    );",
    "provider state insertion",
  );
  source = replaceOnce(
    source,
    "  const diagnosticsEnabled = environment.features.developmentDiagnostics;",
    "  const selectFormulaRecognitionProvider = useCallback(\n    (provider: MathInkRecognitionProvider) => {\n      const settings = writeFormulaRecognitionSettings(provider);\n      setSelectedFormulaRecognitionProvider(settings.provider);\n      notify({\n        kind: \"success\",\n        message: \"Способ распознавания формул сохранён.\",\n      });\n    },\n    [notify],\n  );\n  const mathInkRecognizer =\n    mathInkRecognizers[selectedFormulaRecognitionProvider];\n  const diagnosticsEnabled = environment.features.developmentDiagnostics;",
    "provider selection composition",
  );
  source = replaceOnce(
    source,
    "          ) : effectiveRoute === \"settings\" ? (\n            <SettingsPage environment={environment} />",
    "          ) : effectiveRoute === \"settings\" ? (\n            <SettingsPage\n              environment={environment}\n              onProviderChange={selectFormulaRecognitionProvider}\n              recognizers={mathInkRecognizers}\n              selectedProvider={selectedFormulaRecognitionProvider}\n            />",
    "SettingsPage invocation",
  );
  return source;
});

await patch("src/app/bootstrap/main.tsx", (source) => {
  source = replaceOnce(
    source,
    'import { createConfiguredMathInkRecognizer } from "./math-ink";',
    'import { createConfiguredMathInkRecognizers } from "./math-ink";',
    "bootstrap import",
  );
  source = replaceOnce(
    source,
    "const mathInkRecognizer = createConfiguredMathInkRecognizer(environment);",
    "const mathInkRecognizers = createConfiguredMathInkRecognizers(environment);",
    "bootstrap construction",
  );
  return replaceOnce(
    source,
    "      mathInkRecognizer={mathInkRecognizer}",
    "      mathInkRecognizers={mathInkRecognizers}",
    "ProductShell registry prop",
  );
});

await patch("src/app/configuration/environment.ts", (source) =>
  replaceOnce(
    source,
    '      mathInkApiBaseUrl ?? "/api/v1/math-ink",',
    '      mathInkApiBaseUrl ?? "/api/v1/formula-recognition",',
    "formula recognition default base URL",
  ),
);

await patch("src/app/ProductShell.test.tsx", (source) =>
  replaceOnce(
    source,
    '  mathInkApiBaseUrl: "/api/v1/math-ink",',
    '  mathInkApiBaseUrl: "/api/v1/formula-recognition",',
    "ProductShell test base URL",
  ),
);
