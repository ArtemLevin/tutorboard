import { useEffect, useMemo, useState } from "react";

import type { SmartInkCorpusPointerType } from "../modules/smart-ink-spike/public";
import {
  smartInkCanvasRecognitionPolicy,
  subscribeSmartInkDiagnostics,
  type SmartInkDiagnosticRecord,
} from "../modules/smart-ink/public";
import {
  createSmartInkDiagnosticExport,
  detectSmartInkBrowser,
  downloadSmartInkDiagnostic,
  smartInkDiagnosticFilename,
  type SmartInkPointerMetadata,
} from "./smart-ink-diagnostics-export";
import "./smart-ink-diagnostics.css";

interface SmartInkDiagnosticView {
  readonly pointer: SmartInkPointerMetadata | null;
  readonly record: SmartInkDiagnosticRecord;
}

interface ActivePointer {
  readonly pointerType: SmartInkCorpusPointerType;
  readonly startedAt: number;
}

const statusLabels = {
  ambiguous: "Неоднозначно",
  recognized: "Распознано",
  unrecognized: "Не распознано",
} as const;

const reasonLabels: Readonly<
  Record<SmartInkDiagnosticRecord["reason"], string>
> = {
  "proposal-created": "Создана замена BoardDocument",
  "recognizer-ambiguous": "Два кандидата имеют близкую уверенность",
  "recognizer-unrecognized": "Уверенность ниже порога",
  "replacement-not-renderable": "Геометрия не прошла проверку размера",
};

function normalizePointerType(value: string): SmartInkCorpusPointerType {
  return value === "mouse" || value === "pen" || value === "touch"
    ? value
    : "unknown";
}

function metric(value: number | undefined): string {
  return value === undefined ? "—" : value.toFixed(3);
}

function confidence(value: number | undefined): string {
  return value === undefined ? "—" : `${Math.round(value * 100)}%`;
}

function isBoardPointerEvent(event: PointerEvent): boolean {
  return (
    event.target instanceof Element &&
    event.target.closest('[data-testid="board-stage"]') !== null
  );
}

export function SmartInkDiagnosticsPanel() {
  const [expanded, setExpanded] = useState(true);
  const [view, setView] = useState<SmartInkDiagnosticView | null>(null);

  useEffect(() => {
    const activePointers = new Map<number, ActivePointer>();
    let latestPointer: SmartInkPointerMetadata | null = null;

    const handlePointerDown = (event: PointerEvent) => {
      if (!isBoardPointerEvent(event)) {
        return;
      }
      activePointers.set(event.pointerId, {
        pointerType: normalizePointerType(event.pointerType),
        startedAt: event.timeStamp,
      });
    };
    const handlePointerFinish = (event: PointerEvent) => {
      const active = activePointers.get(event.pointerId);
      if (active === undefined) {
        return;
      }
      latestPointer = {
        durationMs: Math.max(0, event.timeStamp - active.startedAt),
        pointerType: active.pointerType,
      };
      activePointers.delete(event.pointerId);
    };
    const unsubscribe = subscribeSmartInkDiagnostics((record) => {
      setView({ pointer: latestPointer, record });
    });

    window.addEventListener("pointerdown", handlePointerDown, true);
    window.addEventListener("pointerup", handlePointerFinish, true);
    window.addEventListener("pointercancel", handlePointerFinish, true);
    return () => {
      unsubscribe();
      window.removeEventListener("pointerdown", handlePointerDown, true);
      window.removeEventListener("pointerup", handlePointerFinish, true);
      window.removeEventListener("pointercancel", handlePointerFinish, true);
    };
  }, []);

  const details = useMemo(() => {
    const record = view?.record;
    const first = record?.recognizer.candidates[0];
    const second = record?.recognizer.candidates[1];
    const selected =
      record?.selectedCandidateKind === null ||
      record?.selectedCandidateKind === undefined
        ? first
        : record.recognizer.candidates.find(
            (candidate) => candidate.kind === record.selectedCandidateKind,
          );
    return { first, metrics: selected?.diagnostics, second };
  }, [view]);

  const exportDiagnostic = () => {
    if (view === null) {
      return;
    }
    const capturedAt = new Date().toISOString();
    const pointer = view.pointer ?? {
      durationMs: 0,
      pointerType: navigator.maxTouchPoints > 0 ? "touch" : "mouse",
    };
    const diagnostic = createSmartInkDiagnosticExport(view.record, {
      browser: detectSmartInkBrowser(navigator.userAgent),
      capturedAt,
      ...pointer,
    });
    downloadSmartInkDiagnostic(
      diagnostic,
      smartInkDiagnosticFilename(capturedAt),
    );
  };

  return (
    <aside
      aria-label="Диагностика Smart Ink"
      className="smart-ink-diagnostics-panel"
    >
      <header>
        <div>
          <strong>Smart Ink diagnostics</strong>
          <span>Development evidence</span>
        </div>
        <button
          aria-expanded={expanded}
          aria-label={
            expanded
              ? "Свернуть диагностику Smart Ink"
              : "Развернуть диагностику Smart Ink"
          }
          onClick={() => setExpanded((current) => !current)}
          type="button"
        >
          {expanded ? "−" : "+"}
        </button>
      </header>
      {expanded ? (
        <div className="smart-ink-diagnostics-content">
          {view === null ? (
            <p>Нарисуйте фигуру инструментом Smart Ink.</p>
          ) : (
            <>
              <dl>
                <div>
                  <dt>Результат</dt>
                  <dd>{statusLabels[view.record.recognizer.status]}</dd>
                </div>
                <div>
                  <dt>Выбрано</dt>
                  <dd>{view.record.selectedCandidateKind ?? "—"}</dd>
                </div>
                <div>
                  <dt>Первый кандидат</dt>
                  <dd>
                    {details.first?.kind ?? "—"} ·{" "}
                    {confidence(details.first?.confidence)}
                  </dd>
                </div>
                <div>
                  <dt>Второй кандидат</dt>
                  <dd>
                    {details.second?.kind ?? "—"} ·{" "}
                    {confidence(details.second?.confidence)}
                  </dd>
                </div>
                <div>
                  <dt>Разница</dt>
                  <dd>
                    {details.first === undefined || details.second === undefined
                      ? "—"
                      : metric(
                          details.first.confidence - details.second.confidence,
                        )}
                  </dd>
                </div>
                <div>
                  <dt>Axis ratio</dt>
                  <dd>{metric(details.metrics?.axisRatio)}</dd>
                </div>
                <div>
                  <dt>Closedness</dt>
                  <dd>{metric(details.metrics?.closedness)}</dd>
                </div>
                <div>
                  <dt>Residual</dt>
                  <dd>{metric(details.metrics?.normalizedResidual)}</dd>
                </div>
                <div>
                  <dt>Точки</dt>
                  <dd>
                    {view.record.sourcePointCount} →{" "}
                    {view.record.recognizer.sampledPointCount}
                  </dd>
                </div>
                <div>
                  <dt>Pointer</dt>
                  <dd>
                    {view.pointer?.pointerType ?? "unknown"} ·{" "}
                    {Math.round(view.pointer?.durationMs ?? 0)} ms
                  </dd>
                </div>
                <div>
                  <dt>Причина</dt>
                  <dd>{reasonLabels[view.record.reason]}</dd>
                </div>
              </dl>
              <small>
                Policy: confidence{" "}
                {smartInkCanvasRecognitionPolicy.minimumConfidence}
                {" · "}margin {smartInkCanvasRecognitionPolicy.ambiguityMargin}
                {" · "}samples {smartInkCanvasRecognitionPolicy.sampleCount}
              </small>
              <small>{view.record.recognizer.recognizerVersion}</small>
            </>
          )}
          <button
            disabled={view === null}
            onClick={exportDiagnostic}
            type="button"
          >
            Экспортировать последний жест
          </button>
          <small>
            Экспорт содержит только координаты жеста и технические метрики.
          </small>
        </div>
      ) : null}
    </aside>
  );
}
