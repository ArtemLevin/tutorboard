# C3.9 stable-culling ABBA — заранее закреплённый протокол

Дата: 12.10.2026. Production PR #232 остаётся Draft.

- Control: `2110a8e03fe9adb836ffc1f470e35ff7be980323`.
- Candidate: `9303cccd7b9b8857e49484bf0576cde72c4b04fa`.
- Harness: отдельный commit/PR от candidate; production-код не меняется.
- Два независимых Ubuntu 24.04 runners, закреплённый Playwright Chromium,
  последовательные тесты с одним worker и retries=0. Раздельные production
  worktrees, единый внешний harness, чистота и SHA каждого worktree проверяются.
- Основные измерения: trace-off, 3 полных цикла ABBA, по 6 повторов каждого
  варианта на runner. 3k/5k/10k и offscreen 10k, 4 PNG + 6 JPEG, DPR2, cold.
- Затем отдельный диагностический trace-on ABBA по той же матрице.
- Native wheel: прежние 18 чередующихся шагов, ожидание кадра между вводами.
  Профиль с независимым расписанием ввода остаётся отдельным последующим gate.
- Проверяются байты документа, browser/runtime, 19 состояний камеры
  (начальное + 18 изменений), visible count и точное совпадение композитных
  scene pixels в начале/конце и между arms. DOM-панели исключены из снимка;
  все production scene canvases включены с исходным DPR.
- Метрики: run p95, доля >100 мс, wall time от первого wheel до наблюдаемого
  commit, commit p95, первый rAF gap. Парные отношения считаются A1/B1 и A2/B2;
  отдельно публикуются ABBA blocks и грубый bootstrap по блокам.
- Основной порог: медианный парный выигрыш ≥20% на 5k/10k, уменьшение доли
  >100 мс и отсутствие роста wall time. На 3k/offscreen допускается до 10%
  ухудшения; результат должен иметь согласованное направление между runners.
- Исключение наблюдений после получения метрик и подбор числа повторов
  запрещены. Несопоставимость даёт INCONCLUSIVE. Неуспех порога — NO-GO
  для заявления об ускорении. Зелёный workflow означает пригодные данные.
- PASS этого latency screening потребует дальнейших memory/pen/hit/data
  проверок и полного gate перед merge; он самостоятельно не разрешает merge.

Все per-run logs, screenshots, bounded traces, сведения CPU/runner и итоговые
JSON публикуются в Actions artifacts. Число сценариев: 48 основных и 16
диагностических на runner, всего 128.
