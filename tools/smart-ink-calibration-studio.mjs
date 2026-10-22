import {
  glyphCharacterSets,
  glyphShapeNegatives,
  parseSmartInkGlyphCorpus,
  smartInkGlyphCorpusLimits,
  smartInkGlyphCorpusVersion,
  summarizeSmartInkGlyphCorpus,
  targetForGlyph,
} from "./smart-ink-glyph-corpus.mjs";
import {
  emptyStudioCorpus,
  exportLegacyGeometryCorpus,
  mergeStudioCorpus,
  parseStudioBackup,
  relabelStudioSample,
  removeStudioSample,
  studioLocalSchema,
} from "./smart-ink-calibration-studio-core.mjs";
import {
  parseGlyphPrototypeModel,
  rankGlyphPrototype,
} from "../src/modules/smart-ink/v2/glyph-prototype.ts";
import { recognizeSmartInkStroke } from "../src/modules/smart-ink-spike/recognizer.ts";

const $ = (selector) => globalThis.document.querySelector(selector);
const capture = $("#capture");
const preview = $("#preview");
const script = $("#script");
const character = $("#character");
const status = $("#status");
const writer = $("#writer");
const device = $("#device");
const profile = $("#profile");
const browser = $("#browser");
const shapes = {
  line: "Линия",
  circle: "Окружность",
  ellipse: "Эллипс",
  rectangle: "Прямоугольник",
  square: "Квадрат",
  triangle: "Треугольник",
  arrow: "Стрелка",
};
const randomId = (prefix) =>
  prefix +
  "-" +
  Array.from(crypto.getRandomValues(new Uint8Array(8)))
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("");
let corpus = emptyStudioCorpus();
let selectedId = null;
let active = null;
let strokes = [];
let startMs = null;
let pointerType = "mouse";
let model = null;
let dirty = false;

writer.value = randomId("writer");
device.value = randomId("device");
browser.value = navigator.userAgent.includes("Firefox")
  ? "firefox"
  : /Chrom|Edg/.test(navigator.userAgent)
    ? "chromium"
    : "other";

function announce(message) {
  status.textContent = message;
}
function targetOfSelection() {
  if (script.value === "shape")
    return { kind: "shape", shape: character.value };
  if (script.value === "ordinary-ink") return { kind: "ordinary-ink" };
  return targetForGlyph(script.value, character.value);
}
function textFor(target) {
  if (target.kind === "shape") return shapes[target.shape] ?? target.shape;
  if (target.kind === "ordinary-ink") return "Произвольный штрих";
  return target.character + " · " + target.script;
}
function renderTarget() {
  const category = script.value;
  const choices =
    category === "shape"
      ? glyphShapeNegatives
      : category === "ordinary-ink"
        ? ["ordinary-ink"]
        : glyphCharacterSets[category];
  const previous = character.value;
  character.replaceChildren(
    ...choices.map((name) => {
      const node = globalThis.document.createElement("option");
      node.value = name;
      node.textContent = shapes[name] ?? name;
      return node;
    }),
  );
  if (choices.includes(previous)) character.value = previous;
  const target = targetOfSelection();
  $("#target-name").textContent = textFor(target);
  $("#target-meta").textContent =
    target.kind === "glyph"
      ? "Unicode U+" +
        target.character
          .codePointAt(0)
          .toString(16)
          .toUpperCase()
          .padStart(4, "0")
      : target.kind === "shape"
        ? "Геометрическая фигура"
        : "Отрицательный пример";
}
function draw(canvas, groups, fit = false) {
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.strokeStyle = "#263b56";
  ctx.fillStyle = "#263b56";
  ctx.lineWidth = 3;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  let dx = 0,
    dy = 0,
    factor = 1;
  if (fit && groups.length > 0) {
    const points = groups.flatMap((group) => group);
    const xs = points.map(({ x }) => x),
      ys = points.map(({ y }) => y);
    const lowX = Math.min(...xs),
      lowY = Math.min(...ys);
    const w = Math.max(1, Math.max(...xs) - lowX);
    const h = Math.max(1, Math.max(...ys) - lowY);
    factor = Math.min((canvas.width - 64) / w, (canvas.height - 64) / h, 4);
    dx = (canvas.width - w * factor) / 2 - lowX * factor;
    dy = (canvas.height - h * factor) / 2 - lowY * factor;
  }
  for (const group of groups) {
    if (!group.length) continue;
    ctx.beginPath();
    group.forEach(({ x, y }, index) => {
      const xx = x * factor + dx,
        yy = y * factor + dy;
      if (index === 0) ctx.moveTo(xx, yy);
      else ctx.lineTo(xx, yy);
    });
    ctx.stroke();
    if (group.length === 1) {
      ctx.beginPath();
      ctx.arc(
        group[0].x * factor + dx,
        group[0].y * factor + dy,
        2.4,
        0,
        Math.PI * 2,
      );
      ctx.fill();
    }
  }
}
function refreshCanvas() {
  draw(capture, [...strokes, ...(active ? [active.points] : [])]);
}
function resetDrawing(message) {
  if (active) {
    const id = active.id;
    active = null;
    if (capture.hasPointerCapture(id)) capture.releasePointerCapture(id);
  }
  strokes = [];
  startMs = null;
  refreshCanvas();
  updateControls();
  if (message) announce(message);
}
function updateControls() {
  $("#add").disabled =
    strokes.length === 0 ||
    corpus.samples.length >= smartInkGlyphCorpusLimits.samples;
  $("#remove-stroke").disabled = strokes.length === 0;
  const selected = corpus.samples.find(({ id }) => id === selectedId);
  $("#relabel").disabled = !selected;
  $("#delete-sample").disabled = !selected;
  $("#evaluate").disabled = !selected;
  $("#export-glyph").disabled = corpus.samples.length === 0;
  const geometric = exportLegacyGeometryCorpus(corpus);
  $("#export-geometry").disabled = geometric.samples.length === 0;
}
function updateList() {
  const summary = summarizeSmartInkGlyphCorpus(corpus);
  const geometry = corpus.samples.filter(
    ({ target }) => target.kind === "shape",
  ).length;
  $("#counts").textContent =
    `Всего: ${summary.total} · фигуры: ${geometry} · кириллица: ${summary.scripts.Cyrl} · латиница: ${summary.scripts.Latn} · греческий: ${summary.scripts.Grek} · цифры: ${summary.scripts.Zyyy} · негативы: ${summary.negatives} · без проверки: ${summary.unreviewed}` +
    (dirty
      ? " · есть несохранённые изменения"
      : " · локальные изменения сохранены или ещё не создавались");
  const list = $("#saved-samples");
  list.replaceChildren();
  const visible = corpus.samples.slice(-120).reverse();
  for (const sample of visible) {
    const button = globalThis.document.createElement("button");
    button.textContent =
      textFor(sample.target) +
      " · " +
      sample.strokes.length +
      " штр. · " +
      (sample.labelStatus === "reviewed" ? "проверен" : "требует проверки");
    button.dataset.sampleId = sample.id;
    button.setAttribute("aria-pressed", String(sample.id === selectedId));
    list.append(button);
  }
  if (corpus.samples.length > visible.length) {
    const info = globalThis.document.createElement("p");
    info.className = "hint";
    info.textContent =
      "Показаны последние 120 образцов; полный набор сохраняется в JSON.";
    list.append(info);
  }
  const selected = corpus.samples.find(({ id }) => id === selectedId);
  draw(
    preview,
    selected ? selected.strokes.map(({ points }) => points) : [],
    true,
  );
  $("#evaluation").textContent = selected
    ? "Образец выбран. Нажмите «Проверить выбранный образец»."
    : "Выберите сохранённый образец.";
  updateControls();
}
function modified(message) {
  dirty = true;
  updateList();
  announce(message);
}
function canvasPoint(event) {
  const rect = capture.getBoundingClientRect();
  return {
    x:
      Math.round(
        Math.max(
          0,
          Math.min(
            capture.width,
            ((event.clientX - rect.left) / rect.width) * capture.width,
          ),
        ) * 1000,
      ) / 1000,
    y:
      Math.round(
        Math.max(
          0,
          Math.min(
            capture.height,
            ((event.clientY - rect.top) / rect.height) * capture.height,
          ),
        ) * 1000,
      ) / 1000,
  };
}
function abortPointer(message) {
  if (!active) return;
  const id = active.id;
  active = null;
  if (capture.hasPointerCapture(id)) capture.releasePointerCapture(id);
  refreshCanvas();
  if (message) announce(message);
}
function appendPoints(event) {
  const events = event.getCoalescedEvents?.() ?? [];
  for (const e of events.length ? events : [event]) {
    if (!active) break;
    if (active.points.length >= smartInkGlyphCorpusLimits.pointsPerStroke) {
      abortPointer("Лимит точек штриха превышен.");
      break;
    }
    const point = canvasPoint(e);
    point.timeMs = Math.max(
      active.points.at(-1)?.timeMs ?? 0,
      Math.round(performance.now() - startMs),
    );
    point.pressure = Number.isFinite(e.pressure)
      ? Math.max(0, Math.min(1, e.pressure))
      : 0.5;
    if (point.timeMs > smartInkGlyphCorpusLimits.durationMs) {
      abortPointer("Слишком длительная запись.");
      break;
    }
    const prev = active.points.at(-1);
    if (!prev || prev.x !== point.x || prev.y !== point.y)
      active.points.push(point);
  }
  refreshCanvas();
}
capture.addEventListener("pointerdown", (event) => {
  if (active || event.button !== 0) return;
  if (
    strokes.length >= smartInkGlyphCorpusLimits.strokes ||
    strokes.reduce((n, arr) => n + arr.length, 0) >=
      smartInkGlyphCorpusLimits.totalPoints
  ) {
    announce("Достигнут лимит штрихов. Сохраните текущий пример.");
    return;
  }
  if (startMs === null) startMs = performance.now();
  capture.setPointerCapture(event.pointerId);
  active = { id: event.pointerId, points: [] };
  pointerType = ["mouse", "pen", "touch"].includes(event.pointerType)
    ? event.pointerType
    : "mouse";
  appendPoints(event);
  event.preventDefault();
});
capture.addEventListener("pointermove", (event) => {
  if (!active || event.pointerId !== active.id) return;
  appendPoints(event);
  event.preventDefault();
});
capture.addEventListener("pointerup", (event) => {
  if (!active || event.pointerId !== active.id) return;
  appendPoints(event);
  if (!active) return;
  const finished = active;
  active = null;
  if (capture.hasPointerCapture(event.pointerId))
    capture.releasePointerCapture(event.pointerId);
  if (
    strokes.reduce((n, arr) => n + arr.length, 0) + finished.points.length >
    smartInkGlyphCorpusLimits.totalPoints
  ) {
    resetDrawing("Превышен общий лимит точек образца.");
    return;
  }
  if (finished.points.length) strokes.push(finished.points);
  refreshCanvas();
  updateControls();
  announce("Записано штрихов: " + strokes.length);
  event.preventDefault();
});
capture.addEventListener("pointercancel", () => abortPointer("Штрих отменён."));
capture.addEventListener("lostpointercapture", () =>
  abortPointer("Захват указателя потерян."),
);
globalThis.window.addEventListener("blur", () =>
  abortPointer("Запись прервана."),
);
globalThis.window.addEventListener("keydown", (event) => {
  if (event.key === "Escape") resetDrawing("Черновик очищен.");
});
$("#remove-stroke").addEventListener("click", () => {
  strokes.pop();
  if (!strokes.length) startMs = null;
  refreshCanvas();
  updateControls();
  announce("Последний штрих удалён.");
});
$("#clear").addEventListener("click", () => resetDrawing("Черновик очищен."));
script.addEventListener("change", () => {
  renderTarget();
  announce("Класс изменён.");
});
character.addEventListener("change", renderTarget);
$("#next").addEventListener("click", () => {
  character.selectedIndex =
    (character.selectedIndex + 1) % character.options.length;
  resetDrawing();
  renderTarget();
  announce("Следующий символ.");
});
$("#add").addEventListener("click", () => {
  if (active || !strokes.length) return;
  const sample = {
    id: randomId("sample"),
    writerId: writer.value.trim(),
    deviceId: device.value.trim(),
    deviceProfile: profile.value,
    browser: browser.value,
    pointerType,
    labelStatus: "unreviewed",
    provenance: "captured",
    target: targetOfSelection(),
    strokes: strokes.map((points) => ({ points })),
  };
  try {
    const next = parseSmartInkGlyphCorpus({
      schemaVersion: smartInkGlyphCorpusVersion,
      samples: [...corpus.samples, sample],
    });
    corpus = next;
    selectedId = sample.id;
    resetDrawing();
    modified("Образец добавлен. Метка требует независимой проверки.");
  } catch (error) {
    announce(
      "Образец отклонён: " +
        (error instanceof Error ? error.message : "ошибка"),
    );
  }
});
$("#saved-samples").addEventListener("click", (event) => {
  const button = event.target.closest("button[data-sample-id]");
  if (!button) return;
  selectedId = button.dataset.sampleId;
  updateList();
});
$("#relabel").addEventListener("click", () => {
  if (!selectedId) return;
  try {
    corpus = relabelStudioSample(corpus, selectedId, targetOfSelection());
    modified("Метка изменена. Требуется независимая проверка.");
  } catch (error) {
    announce("Ошибка: " + error.message);
  }
});
$("#delete-sample").addEventListener("click", () => {
  if (!selectedId) return;
  corpus = removeStudioSample(corpus, selectedId);
  selectedId = corpus.samples.at(-1)?.id ?? null;
  modified("Образец удалён из рабочего набора.");
});
function downloadJson(filename, data) {
  const blob = new Blob([JSON.stringify(data, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const anchor = globalThis.document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  queueMicrotask(() => URL.revokeObjectURL(url));
}
$("#export-glyph").addEventListener("click", () => {
  downloadJson(
    "smart-ink-studio-glyph-corpus.json",
    parseSmartInkGlyphCorpus(corpus),
  );
  announce("Общий JSON экспортирован.");
});
$("#export-geometry").addEventListener("click", () => {
  const legacy = exportLegacyGeometryCorpus(corpus);
  downloadJson("smart-ink-studio-geometry.json", legacy);
  announce(
    `Экспортировано геометрических/отрицательных примеров: ${legacy.samples.length}. Остальные записи сохранены в общем формате.`,
  );
});
$("#import").addEventListener("click", () => $("#file-import").click());
$("#file-import").addEventListener("change", async (event) => {
  const file = event.target.files?.[0];
  event.target.value = "";
  if (!file) return;
  try {
    if (file.size > 8_000_000)
      throw new TypeError("JSON превышает лимит 8 MB.");
    const input = JSON.parse(await file.text());
    const next = mergeStudioCorpus(
      corpus,
      input,
      {
        writerId: writer.value.trim(),
        deviceId: device.value.trim(),
        deviceProfile: profile.value,
        browser: browser.value,
      },
      () => randomId("sample"),
    );
    const added = next.samples.length - corpus.samples.length;
    corpus = next;
    selectedId = next.samples.at(-1)?.id ?? selectedId;
    modified(`Импортировано ${added} образцов. Оригинал не изменён.`);
  } catch (error) {
    announce(
      "Ошибка импорта: " + (error instanceof Error ? error.message : "JSON"),
    );
  }
});

function openStore() {
  return new Promise((resolve, reject) => {
    const request = globalThis.indexedDB.open("tutorboard-smart-ink-studio", 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains("backups"))
        db.createObjectStore("backups");
    };
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
    request.onblocked = () =>
      reject(new Error("Локальная база данных заблокирована."));
  });
}
async function localOperation(mode, value) {
  const db = await openStore();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(
        "backups",
        mode === "load" ? "readonly" : "readwrite",
      );
      const store = tx.objectStore("backups");
      const request =
        mode === "load"
          ? store.get("current")
          : mode === "delete"
            ? store.delete("current")
            : store.put(value, "current");
      let result;
      request.onsuccess = () => {
        result = request.result;
      };
      tx.oncomplete = () => resolve(result);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}
$("#save-local").addEventListener("click", async () => {
  try {
    const snapshot = {
      schemaVersion: studioLocalSchema,
      corpus: parseSmartInkGlyphCorpus(corpus),
      profile: {
        writerId: writer.value,
        deviceId: device.value,
        deviceProfile: profile.value,
        browser: browser.value,
      },
    };
    await localOperation("save", snapshot);
    dirty = false;
    updateList();
    announce("Локальная копия сохранена в этом браузере.");
  } catch (error) {
    announce("Ошибка локального сохранения: " + error.message);
  }
});
$("#load-local").addEventListener("click", async () => {
  try {
    const backup = await localOperation("load");
    if (!backup) {
      announce("Локальной копии пока нет.");
      return;
    }
    const restored = parseStudioBackup(backup);
    if (
      corpus.samples.length &&
      !globalThis.confirm(
        "Заменить текущие образцы локальной копией? Экспортируйте несохранённые данные перед заменой.",
      )
    )
      return;
    corpus = restored;
    const saved = backup.profile;
    if (saved) {
      writer.value = saved.writerId;
      device.value = saved.deviceId;
      profile.value = saved.deviceProfile;
      browser.value = saved.browser;
    }
    selectedId = corpus.samples.at(-1)?.id ?? null;
    dirty = false;
    updateList();
    announce("Локальная копия загружена.");
  } catch (error) {
    announce("Ошибка восстановления: " + error.message);
  }
});
$("#delete-local").addEventListener("click", async () => {
  if (
    !globalThis.confirm(
      "Удалить локальную копию? Перед этим рекомендуется экспортировать JSON.",
    )
  )
    return;
  try {
    await localOperation("delete");
    announce(
      "Локальная копия удалена. Данные текущей вкладки сохранены в памяти.",
    );
  } catch (error) {
    announce("Ошибка удаления: " + error.message);
  }
});
$("#import-model").addEventListener("click", () => $("#model-import").click());
$("#model-import").addEventListener("change", async (event) => {
  const file = event.target.files?.[0];
  event.target.value = "";
  if (!file) return;
  try {
    if (file.size > 1_000_000) throw new TypeError("Модель слишком большая.");
    model = parseGlyphPrototypeModel(JSON.parse(await file.text()));
    announce(
      `Экспериментальная модель загружена (${model.classes.length} классов). Автокоррекция выключена.`,
    );
  } catch (error) {
    model = null;
    announce("Ошибка модели: " + error.message);
  }
});
$("#evaluate").addEventListener("click", () => {
  const sample = corpus.samples.find(({ id }) => id === selectedId);
  if (!sample) return;
  const lines = [
    "Эталон: " + textFor(sample.target),
    "Статус: экспериментальная диагностика",
  ];
  if (sample.strokes.length === 1 && sample.strokes[0].points.length >= 2) {
    const geometry = recognizeSmartInkStroke(
      sample.id,
      sample.strokes[0].points,
      {
        minimumConfidence: 0.58,
        ambiguityMargin: 0.08,
        sampleCount: 96,
      },
    );
    lines.push(
      "Геометрия (спайк, не production Smart Ink V2): " +
        geometry.status +
        ", " +
        (geometry.candidates[0]?.kind ?? "нет") +
        " (" +
        (geometry.candidates[0]?.confidence?.toFixed(3) ?? "—") +
        ")",
    );
  } else
    lines.push("Геометрия: диагностируется только один непрерывный штрих.");
  if (model) {
    const ranked = rankGlyphPrototype(model, sample.strokes, "auto");
    lines.push("Символы (расстояния, без вероятностей):");
    for (const guess of ranked.candidates) {
      lines.push(
        "  " +
          guess.script +
          ":" +
          guess.character +
          " — " +
          guess.distance.toFixed(4),
      );
    }
  } else lines.push("Символы: загрузите экспериментальную модель JSON.");
  lines.push(
    "Решение об автозамене: ЗАПРЕЩЕНО — нет подтверждённой калибровки.",
  );
  $("#evaluation").textContent = lines.join("\n");
});
renderTarget();
updateList();
refreshCanvas();
announce("Студия готова. Выберите класс и нарисуйте пример.");
