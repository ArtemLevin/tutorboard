# Smart Ink corpus protocol

## Назначение

Этот протокол закрывает следующий gate Phase 9 после шестиклассового
геометрического spike. До изменения `BoardDocument`, collaboration и UI доски
нужно измерить recognizer на реальных штрихах и отрицательных примерах.

Corpus имеет версию `tutorboard.smart-ink-corpus/0.1`. Внешний JSON
runtime-валидируется функцией `parseSmartInkCorpus`; синтетические fixtures
помечены как `synthetic` и не могут открыть production-gate.

Допускаются три происхождения:

- `captured` — человек рисовал непосредственно в capture-странице TutorBoard;
- `external-human` — реальный рисунок импортирован из атрибутированного
  публичного датасета; `traceOrigin` различает записанную траекторию и
  восстановленный растровый контур;
- `synthetic` — идеальная или человекоподобная аппроксимация.

`external-human` может участвовать в calibration-gate, но не может выдавать
себя за capture конкретного браузера. Подбор и ограничения датасетов описаны в
[`SMART_INK_DATASETS.md`](SMART_INK_DATASETS.md).

Для Quick, Draw! импортёр может сохранить закрытую `sourceCategory`. Она
нужна для сбалансированной проверки отрицательных классов и допускает только
проверенные отображения `squiggle`, `star`, `zigzag` в `negative`.

Runtime boundary допускает не более 1000 образцов, 4096 точек на образец и
длительность одного штриха не более 300 секунд. Невалидный corpus отклоняется
целиком до benchmark.

## Локальный сбор

1. Откройте `tools/smart-ink-corpus-capture.html` в Chromium/Chrome/Edge.
2. Выберите ожидаемый класс и общий профиль устройства без ФИО.
3. Нарисуйте фигуру одним непрерывным штрихом.
4. Проверьте метку и нажмите «Добавить пример».
5. Соберите часть корпуса и экспортируйте JSON.
6. Повторите в Firefox и объедините предыдущий JSON через кнопку
   «Объединить с JSON».

Страница не выполняет сетевых запросов. Данные остаются в памяти вкладки до
экспорта. `pointercancel`, потеря pointer capture, потеря фокуса и `Escape`
отменяют незавершённый штрих.

## Минимальный состав

| Ground truth | Минимум captured-примеров |
| ------------ | ------------------------: |
| line         |                        40 |
| circle       |                        40 |
| ellipse      |                        40 |
| rectangle    |                        40 |
| square       |                        40 |
| triangle     |                        40 |
| negative     |                        60 |

Нужно покрыть как Chromium, так и Firefox. Для положительных классов полезны
разные масштабы, повороты, скорость, дрожание, зазоры и повторный проход.
Отрицательные примеры: стрелки, дуги, буквы, цифры, формулы, скобки, волны,
спирали и scribble.

## Приватность

Corpus не содержит:

- ФИО ученика или преподавателя;
- идентификатор занятия, организации или документа;
- текст с доски и транскрипт;
- точный user-agent, IP-адрес или временную метку;
- pressure/tilt до отдельного решения о контракте.

`deviceProfile` выбирается из закрытого списка общих профилей:
`windows-laptop`, `windows-desktop`, `tablet`, `other-device`. Перед коммитом
captured-fixtures проводится ручная проверка JSON.

Черновые локальные выгрузки можно положить в
`tests/fixtures/smart-ink-corpus/local/`: каталог исключён из Git. После
обезличивания и проверки утверждённый corpus размещается отдельным
reviewable-набором fixtures.

## Метрики и gate

`evaluateSmartInkCorpus` вычисляет:

- confusion matrix;
- precision/recall по шести классам;
- macro precision/recall;
- false-positive rate на `negative`;
- ambiguity и unrecognized rate;
- top-2 accuracy для circle/ellipse и square/rectangle;
- p50/p95/p99 latency.

`assessSmartInkProductionGate` требует:

- не менее 40 captured-примеров каждого положительного класса;
- не менее 60 captured-negative;
- captured-данные из Chromium и Firefox;
- macro precision не ниже `0.94`;
- false-positive rate не выше `0.02`;
- specialized top-2 accuracy не ниже `0.98`;
- unrecognized rate не выше `0.10`;

Top-2 измеряется независимо от confidence threshold: проверяется наличие одной
из явно допустимых интерпретаций в первых двух кандидатах. Confidence-отказ
учитывается отдельной метрикой unrecognized rate.
- p95 не выше `150 ms`.

Gate вычисляет итоговые метрики только по `captured`-образцам. Synthetic
fixtures и `external-human` не входят в precision, false-positive rate или
latency production-gate.

`assessSmartInkCalibrationGate` использует совместно `captured` и
`external-human`, требует тот же минимум классов и те же пороги качества, но не
утверждает поддержку Chromium/Firefox. Это позволяет калибровать confidence по
открытым человеческим данным, сохраняя отдельный platform gate.

`calibrateSmartInkRecognizer` выполняет детерминированный group-safe split.
Образцы одного `sourceGroupId` не могут одновременно попасть в calibration и
holdout. Порог выбирается только по calibration; holdout оценивается один раз
после выбора. Отчёт `tutorboard.smart-ink-calibration/0.1` не содержит точек
штрихов.

После изменения только логики отклонения допускается отдельный независимый
negative holdout. Он обязан исключить все ранее виденные sample/group ID,
сохранить одинаковые квоты `squiggle`, `star`, `zigzag` и оцениваться
единожды после заморозки recognizer. Такой отчёт подтверждает FPR; результаты
положительных классов закрепляются отдельной regression-проверкой.

Запуск синтетической regression baseline:

```bash
npm run spike:smart-ink
```

Успешный synthetic benchmark подтверждает только отсутствие локальной
регрессии. Переход к PR 9.1 разрешает лишь eligible captured corpus.
