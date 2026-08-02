import { mkdir, readFile, writeFile } from "node:fs/promises";

async function replaceOnce(path, before, after) {
  const source = await readFile(path, "utf8");
  const first = source.indexOf(before);
  const last = source.lastIndexOf(before);
  if (first < 0) {
    throw new Error(`Missing patch target in ${path}: ${before.slice(0, 120)}`);
  }
  if (first !== last) {
    throw new Error(`Ambiguous patch target in ${path}: ${before.slice(0, 120)}`);
  }
  await writeFile(path, `${source.slice(0, first)}${after}${source.slice(first + before.length)}`);
}

const boardStage = "src/adapters/canvas-konva/BoardStage.tsx";
await replaceOnce(
  boardStage,
  `const wheelCommitDelayMs = 120;\n\ntype PanSource`,
  `const wheelCommitDelayMs = 120;\nconst rightDoubleClickDelayMs = 450;\nconst rightDoubleClickDistancePx = 8;\n\ntype PanSource`,
);
await replaceOnce(
  boardStage,
  `interface WheelSession {\n  latestViewport: ViewportState;\n  timeoutId: number;\n}\n`,
  `interface RightClickCandidate {\n  readonly objectId: BoardObjectId;\n  readonly point: Vec2;\n  readonly timestamp: number;\n}\n\ninterface WheelSession {\n  latestViewport: ViewportState;\n  timeoutId: number;\n}\n`,
);
await replaceOnce(
  boardStage,
  `  readonly drawingModeKey: string | null;\n  readonly onPanModeRequest?: () => void;`,
  `  readonly drawingModeKey: string | null;\n  readonly onObjectSettingsRequest?:\n    | ((objectId: BoardObjectId) => void)\n    | undefined;\n  readonly onPanModeRequest?: () => void;`,
);
await replaceOnce(
  boardStage,
  `  coordinatePlotInteraction,\n  drawingModeKey,\n  onPanModeRequest,`,
  `  coordinatePlotInteraction,\n  drawingModeKey,\n  onObjectSettingsRequest,\n  onPanModeRequest,`,
);
await replaceOnce(
  boardStage,
  `  const selectionSessionRef = useRef<SelectionSession | null>(null);\n  const wheelSessionRef = useRef<WheelSession | null>(null);`,
  `  const selectionSessionRef = useRef<SelectionSession | null>(null);\n  const wheelSessionRef = useRef<WheelSession | null>(null);\n  const rightClickCandidateRef = useRef<RightClickCandidate | null>(null);`,
);
await replaceOnce(
  boardStage,
  `      const current = clientPoint(event);\n      const viewport = panViewport(session.startViewport, {`,
  `      const current = clientPoint(event);\n      if (\n        session.source === "right" &&\n        Math.hypot(\n          current.x - session.startPoint.x,\n          current.y - session.startPoint.y,\n        ) > rightDoubleClickDistancePx\n      ) {\n        rightClickCandidateRef.current = null;\n      }\n      const viewport = panViewport(session.startViewport, {`,
);
await replaceOnce(
  boardStage,
  `    const handleBlur = () => {\n      finishDrawing(false);\n      finishSelection(false);\n      finishPan(false);\n      cancelWheel();\n    };`,
  `    const handleBlur = () => {\n      rightClickCandidateRef.current = null;\n      finishDrawing(false);\n      finishSelection(false);\n      finishPan(false);\n      cancelWheel();\n    };`,
);
await replaceOnce(
  boardStage,
  `      const wheelSession = wheelSessionRef.current;\n      if (wheelSession !== null) {\n        wheelSessionRef.current = null;\n        window.clearTimeout(wheelSession.timeoutId);\n      }`,
  `      const wheelSession = wheelSessionRef.current;\n      if (wheelSession !== null) {\n        wheelSessionRef.current = null;\n        window.clearTimeout(wheelSession.timeoutId);\n      }\n      rightClickCandidateRef.current = null;`,
);
await replaceOnce(
  boardStage,
  `    const hitObjectId = isLassoAreaModifier\n      ? null\n      : objectIdFromTarget(event.target);\n    const isMiddleButton = event.evt.button === 1;`,
  `    const hitObjectId = isLassoAreaModifier\n      ? null\n      : objectIdFromTarget(event.target);\n    if (isRightButton && onObjectSettingsRequest !== undefined) {\n      const point = clientPoint(event.evt);\n      const previous = rightClickCandidateRef.current;\n      const elapsed =\n        previous === null ? Number.POSITIVE_INFINITY : event.evt.timeStamp - previous.timestamp;\n      const sameObject = previous?.objectId === hitObjectId;\n      const withinDistance =\n        previous !== null &&\n        Math.hypot(point.x - previous.point.x, point.y - previous.point.y) <=\n          rightDoubleClickDistancePx;\n      if (\n        hitObjectId !== null &&\n        sameObject &&\n        elapsed >= 0 &&\n        elapsed <= rightDoubleClickDelayMs &&\n        withinDistance\n      ) {\n        rightClickCandidateRef.current = null;\n        commitWheel();\n        event.cancelBubble = true;\n        event.evt.preventDefault();\n        event.evt.stopPropagation();\n        onObjectSettingsRequest(hitObjectId);\n        return;\n      }\n      rightClickCandidateRef.current =\n        hitObjectId === null\n          ? null\n          : { objectId: hitObjectId, point, timestamp: event.evt.timeStamp };\n    } else if (isRightButton) {\n      rightClickCandidateRef.current = null;\n    }\n    const isMiddleButton = event.evt.button === 1;`,
);

const app = "src/app/App.tsx";
await replaceOnce(
  app,
  `  const [coordinatePlotEditor, setCoordinatePlotEditor] =\n    useState<CoordinatePlotEditorSession | null>(null);\n  const [textDraft, setTextDraft] = useState("Новый текст");`,
  `  const [coordinatePlotEditor, setCoordinatePlotEditor] =\n    useState<CoordinatePlotEditorSession | null>(null);\n  const [selectionInspectorObjectId, setSelectionInspectorObjectId] =\n    useState<BoardObjectId | null>(null);\n  const [textDraft, setTextDraft] = useState("Новый текст");`,
);
await replaceOnce(
  app,
  `      setSelectionState(selectionResult.state);\n      setActiveTool(tool);`,
  `      setSelectionState(selectionResult.state);\n      setSelectionInspectorObjectId(null);\n      setActiveTool(tool);`,
);
await replaceOnce(
  app,
  `      activateTool(selectionToolId);\n      setCoordinatePlotEditor({`,
  `      activateTool(selectionToolId);\n      setSelectionInspectorObjectId(null);\n      setCoordinatePlotEditor({`,
);
await replaceOnce(
  app,
  `    const result = commitCommand({\n      ...createCommandMetadata(),\n      kind: "core.objects.add",\n      objects: [object],\n    });\n    if (result.ok) beginCoordinatePlotEditing(object.id);\n  }, [beginCoordinatePlotEditing, commitCommand, createCommandMetadata]);`,
  `    const result = commitCommand({\n      ...createCommandMetadata(),\n      kind: "core.objects.add",\n      objects: [object],\n    });\n    if (!result.ok) return;\n    activateTool(selectionToolId);\n    const selected: SelectionState = {\n      interaction: { kind: "idle" },\n      selectedObjectIds: [object.id],\n    };\n    selectionStateRef.current = selected;\n    setSelectionState(selected);\n    setSelectionInspectorObjectId(null);\n  }, [activateTool, commitCommand, createCommandMetadata]);`,
);
await replaceOnce(
  app,
  `  const updateCoordinatePlotDraft = useCallback(`,
  `  const requestObjectSettings = useCallback(\n    (objectId: BoardObjectId) => {\n      const current = documentRef.current;\n      const object = current.objects[objectId];\n      if (object === undefined || object.source.kind !== "user") return;\n      if (object.kind === "math.coordinate-plot") {\n        setSelectionInspectorObjectId(null);\n        beginCoordinatePlotEditing(objectId);\n        return;\n      }\n      activateTool(selectionToolId);\n      const selected: SelectionState = {\n        interaction: { kind: "idle" },\n        selectedObjectIds: selectionStateRef.current.selectedObjectIds.includes(\n          objectId,\n        )\n          ? selectionStateRef.current.selectedObjectIds\n          : expandSelectionObjectIds(current, [objectId]),\n      };\n      selectionStateRef.current = selected;\n      setSelectionState(selected);\n      setCoordinatePlotEditor(null);\n      setSelectionInspectorObjectId(objectId);\n      setAccessibilityNotice("Настройки объекта открыты");\n    },\n    [activateTool, beginCoordinatePlotEditing],\n  );\n\n  const updateCoordinatePlotDraft = useCallback(`,
);
await replaceOnce(
  app,
  `      onEditRequest: beginCoordinatePlotEditing,\n      onSelectedSeriesChange: selectCoordinatePlotSeries,`,
  `      onSelectedSeriesChange: selectCoordinatePlotSeries,`,
);
await replaceOnce(
  app,
  `    [\n      beginCoordinatePlotEditing,\n      coordinatePlotEditor,\n      selectCoordinatePlotSeries,\n      updateCoordinatePlotViewport,\n    ],`,
  `    [\n      coordinatePlotEditor,\n      selectCoordinatePlotSeries,\n      updateCoordinatePlotViewport,\n    ],`,
);
await replaceOnce(
  app,
  `      if (\n        event.key === "Enter" &&\n        !editing &&\n        selectionStateRef.current.selectedObjectIds.length === 1\n      ) {\n        const objectId = selectionStateRef.current.selectedObjectIds[0]!;\n        if (\n          documentRef.current.objects[objectId]?.kind === "math.coordinate-plot"\n        ) {\n          event.preventDefault();\n          beginCoordinatePlotEditing(objectId);\n          return;\n        }\n      }\n`,
  ``,
);
await replaceOnce(
  app,
  `    activateTool,\n    beginCoordinatePlotEditing,\n    closeShortcuts,`,
  `    activateTool,\n    closeShortcuts,`,
);
await replaceOnce(
  app,
  `  useEffect(() => {\n    const result = reduceSelectionInteraction(selectionStateRef.current, {\n      availableObjectIds: document.order,\n      kind: "prune",\n    });\n    selectionStateRef.current = result.state;\n    setSelectionState(result.state);\n  }, [document.order]);`,
  `  useEffect(() => {\n    const result = reduceSelectionInteraction(selectionStateRef.current, {\n      availableObjectIds: document.order,\n      kind: "prune",\n    });\n    selectionStateRef.current = result.state;\n    setSelectionState(result.state);\n  }, [document.order]);\n\n  useEffect(() => {\n    if (\n      selectionInspectorObjectId !== null &&\n      (!Object.hasOwn(document.objects, selectionInspectorObjectId) ||\n        !selectionState.selectedObjectIds.includes(selectionInspectorObjectId))\n    ) {\n      setSelectionInspectorObjectId(null);\n    }\n  }, [\n    document.objects,\n    selectionInspectorObjectId,\n    selectionState.selectedObjectIds,\n  ]);`,
);
await replaceOnce(
  app,
  `  const selectedCoordinatePlot =\n    selectedObjects.length === 1 &&\n    selectedObjects[0]?.kind === "math.coordinate-plot"\n      ? selectedObjects[0]\n      : null;\n`,
  ``,
);
await replaceOnce(
  app,
  `  const canUngroup =\n    selectedGroupIds.length > 0 &&\n    selectedGroupIds.every((id) => !importRootGroupIds.has(id));`,
  `  const canUngroup =\n    selectedGroupIds.length > 0 &&\n    selectedGroupIds.every((id) => !importRootGroupIds.has(id));\n  const selectionInspectorOpen =\n    coordinatePlotEditor === null &&\n    selectionInspectorObjectId !== null &&\n    selectionState.selectedObjectIds.includes(selectionInspectorObjectId);`,
);
await replaceOnce(
  app,
  `              <div>\n                <dt>Enter / двойной щелчок / Escape</dt>\n                <dd>Открыть или закрыть редактор координатной плоскости</dd>\n              </div>`,
  `              <div>\n                <dt>Двойной щелчок правой кнопкой</dt>\n                <dd>Открыть настройки фигуры или редактор графика</dd>\n              </div>`,
);
await replaceOnce(
  app,
  `          onWorldPointerStart={startDrawing}\n          onPanModeRequest={() => activateTool(navigationToolId)}`,
  `          onWorldPointerStart={startDrawing}\n          onObjectSettingsRequest={requestObjectSettings}\n          onPanModeRequest={() => activateTool(navigationToolId)}`,
);
await replaceOnce(
  app,
  `          <span>Правая кнопка / Space / средняя кнопка — перемещение</span>\n          <span>Escape — отменить действие</span>`,
  `          <span>Правая кнопка / Space / средняя кнопка — перемещение</span>\n          <span>Двойной щелчок правой кнопкой по объекту — настройки</span>\n          <span>Escape — отменить действие</span>`,
);
await replaceOnce(
  app,
  `        {selectionState.selectedObjectIds.length === 0 ? null : (`,
  `        {!selectionInspectorOpen ? null : (`,
);
await replaceOnce(
  app,
  `            <strong>Выделено: {selectionState.selectedObjectIds.length}</strong>\n            <span>`,
  `            <div className="selection-inspector-heading">\n              <strong>Выделено: {selectionState.selectedObjectIds.length}</strong>\n              <button\n                aria-label="Закрыть настройки объекта"\n                onClick={() => setSelectionInspectorObjectId(null)}\n                type="button"\n              >\n                ×\n              </button>\n            </div>\n            <span>`,
);
await replaceOnce(
  app,
  `            {selectedCoordinatePlot === null ||\n            selectedCoordinatePlot.source.kind !== "user" ? null : (\n              <button\n                onClick={() =>\n                  beginCoordinatePlotEditing(selectedCoordinatePlot.id)\n                }\n                type="button"\n              >\n                Редактировать график\n              </button>\n            )}\n`,
  ``,
);

const appTest = "src/app/App.test.tsx";
await replaceOnce(
  appTest,
  `        <button\n          onClick={() => {\n            props.onSelectionPointerStart(selectionStart);\n            props.onSelectionPointerMove(selectionFinish);\n            props.onSelectionPointerFinish(selectionFinish);\n          }}\n          type="button"\n        >\n          Переместить выделение\n        </button>`,
  `        <button\n          onClick={() => {\n            props.onSelectionPointerStart(selectionStart);\n            props.onSelectionPointerMove(selectionFinish);\n            props.onSelectionPointerFinish(selectionFinish);\n          }}\n          type="button"\n        >\n          Переместить выделение\n        </button>\n        <button\n          onClick={() => {\n            const objectId = props.scene.items[0]?.object.id;\n            if (objectId !== undefined) {\n              props.onObjectSettingsRequest?.(objectId);\n            }\n          }}\n          type="button"\n        >\n          Открыть настройки объекта\n        </button>`,
);
await replaceOnce(
  appTest,
  `    expect(\n      screen.getByRole("complementary", { name: "Выделенные объекты" }),\n    ).toBeInTheDocument();\n  });`,
  `    expect(\n      screen.queryByRole("complementary", { name: "Выделенные объекты" }),\n    ).not.toBeInTheDocument();\n    fireEvent.click(\n      screen.getByRole("button", { name: "Открыть настройки объекта" }),\n    );\n    expect(\n      screen.getByRole("complementary", { name: "Выделенные объекты" }),\n    ).toBeInTheDocument();\n  });`,
);
await replaceOnce(
  appTest,
  `  it("moves a selection by keyboard and closes shortcut help with Escape", () => {`,
  `  it("creates a graph without opening its editor and opens it on settings request", () => {\n    render(<App />);\n\n    fireEvent.click(\n      screen.getByRole("button", {\n        name: "Создать координатную плоскость (G)",\n      }),\n    );\n    expect(\n      screen.queryByRole("complementary", {\n        name: "Редактор координатной плоскости",\n      }),\n    ).not.toBeInTheDocument();\n    fireEvent.keyDown(window, { key: "Enter" });\n    expect(\n      screen.queryByRole("complementary", {\n        name: "Редактор координатной плоскости",\n      }),\n    ).not.toBeInTheDocument();\n\n    fireEvent.click(\n      screen.getByRole("button", { name: "Открыть настройки объекта" }),\n    );\n    expect(\n      screen.getByRole("complementary", {\n        name: "Редактор координатной плоскости",\n      }),\n    ).toBeInTheDocument();\n  });\n\n  it("moves a selection by keyboard and closes shortcut help with Escape", () => {`,
);

await mkdir("docs/adr", { recursive: true });
await writeFile(
  "docs/adr/ADR-022-object-settings-right-double-click.md",
  `# ADR-022: Object settings through right-button double-click\n\n- Status: Accepted\n- Date: 2026-08-02\n- Scope: TutorBoard object settings and coordinate-plot editor entry\n\n## Decision\n\n1. Creating a drawing object or coordinate plot leaves its settings closed.\n2. Ordinary selection, Enter and left-button double-click do not open settings.\n3. A right-button double-click on a user object opens the relevant settings surface.\n4. Coordinate plots open the dedicated coordinate-plot editor; other user objects open the selection inspector.\n5. A single right-button press and right-button drag retain board panning.\n6. The double-click recognizer requires the same object, a maximum 450 ms interval and at most 8 px pointer displacement.\n7. A right drag beyond the displacement threshold clears the pending click candidate.\n\n## Consequences\n\nObject creation remains uninterrupted and configuration becomes an explicit gesture. The existing right-button pan contract remains available, while the second stationary click is consumed before a board pan session starts.\n\n## Verification\n\nUnit coverage verifies that ordinary selection keeps settings closed, graph creation keeps the editor closed, Enter has no editor side effect and an object-settings request opens the correct surface. Browser coverage verifies right-button double-click routing and preservation of right-drag panning.\n`,
);
