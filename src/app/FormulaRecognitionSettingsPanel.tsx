import type {
  MathInkRecognitionProvider,
  MathInkRecognizer,
} from "../modules/handwritten-function/public";
import {
  formulaRecognitionProviderDescriptors,
  type FormulaRecognitionProviderDescriptor,
} from "./configuration/formula-recognition-settings";
import "./FormulaRecognitionSettingsPanel.css";

interface FormulaRecognitionSettingsPanelProps {
  readonly onProviderChange: (provider: MathInkRecognitionProvider) => void;
  readonly recognizers: Readonly<
    Partial<Record<MathInkRecognitionProvider, MathInkRecognizer>>
  >;
  readonly selectedProvider: MathInkRecognitionProvider;
}

function ProviderCard({
  available,
  descriptor,
  onProviderChange,
  selected,
}: {
  readonly available: boolean;
  readonly descriptor: FormulaRecognitionProviderDescriptor;
  readonly onProviderChange: (provider: MathInkRecognitionProvider) => void;
  readonly selected: boolean;
}) {
  return (
    <label
      className={`formula-recognition-provider${selected ? " is-selected" : ""}`}
    >
      <span className="formula-recognition-provider-heading">
        <input
          checked={selected}
          name="formula-recognition-provider"
          onChange={() => onProviderChange(descriptor.id)}
          type="radio"
          value={descriptor.id}
        />
        <span>
          <strong>{descriptor.label}</strong>
          <small>
            {descriptor.location === "local" ? "Локально" : "Облако"}
          </small>
        </span>
        {descriptor.recommended ? <em>Рекомендуется</em> : null}
      </span>
      <span className="formula-recognition-provider-description">
        {descriptor.description}
      </span>
      <span className="formula-recognition-provider-meta">
        <span>{descriptor.profile}</span>
        <span>{descriptor.privacy}</span>
      </span>
      <span
        className={`formula-recognition-provider-status ${available ? "is-available" : "is-unavailable"}`}
      >
        {available
          ? "Доступен в текущей сборке"
          : "Автоматическое распознавание выключено в текущей сборке"}
      </span>
    </label>
  );
}

export function FormulaRecognitionSettingsPanel({
  onProviderChange,
  recognizers,
  selectedProvider,
}: FormulaRecognitionSettingsPanelProps) {
  return (
    <section
      aria-labelledby="formula-recognition-settings-title"
      className="formula-recognition-settings"
    >
      <div>
        <p className="product-eyebrow">Расширенные настройки доски</p>
        <h2 id="formula-recognition-settings-title">
          Распознавание математических формул
        </h2>
        <p>
          Выбранный способ применяется к следующему рукописному вводу. Настройка
          хранится только в этом браузере и не включается в документ доски.
        </p>
      </div>
      <fieldset>
        <legend className="visually-hidden">Способ распознавания формул</legend>
        {formulaRecognitionProviderDescriptors.map((descriptor) => (
          <ProviderCard
            available={recognizers[descriptor.id] !== undefined}
            descriptor={descriptor}
            key={descriptor.id}
            onProviderChange={onProviderChange}
            selected={selectedProvider === descriptor.id}
          />
        ))}
      </fieldset>
      <p className="formula-recognition-settings-note" role="status">
        Активный способ: {selectedProvider}. При ошибке сервиса формулу можно
        исправить вручную перед построением графика.
      </p>
    </section>
  );
}
