# Handwritten function PR 3 plan

## Goal

Expose the handwritten-function capability as a complete TutorBoard canvas
workflow. A teacher can collect several strokes, submit them to an injected
`MathInkRecognizer`, review or correct the interpreted expression, preview the
resulting coordinate plot and replace the source ink with one graph through a
single reversible board command.

PR 3 consumes the provider-neutral capture and interpretation contracts from PRs
1 and 2. It does not add HTTP credentials, provider DTOs or a production
recognition service. Those concerns remain the next adapter increment.

## User journey

1. Select **Handwritten function** from the canvas toolbar or press `F`.
2. Draw one or more strokes in world coordinates.
3. Review the stroke count in a non-modal floating panel.
4. Press **Recognize**.
5. TutorBoard persists all completed strokes in one `core.objects.add` command.
6. When a recognizer is available, TutorBoard sends one normalized request and
   interprets the returned candidates.
7. Review the recognized expression, choose another candidate when needed or
   edit the expression directly.
8. TutorBoard validates the edited expression through the PR 2 interpreter,
   creates parameter defaults and renders a transient coordinate-plot preview.
9. Press **Build graph**.
10. TutorBoard executes one `core.objects.replace` command whose originals are
    the persisted pen strokes and whose only replacement is the coordinate plot.
11. One undo restores every source stroke.

Escape, a tool switch or **Keep ink** closes the workflow while preserving the
teacher's completed strokes. **Clear** explicitly removes the current input.

## Product boundary

### Application composition owns

- toolbar and keyboard entry;
- routing BoardStage pointer samples to the handwritten session reducer;
- cancellation and stale-operation protection;
- materializing transient strokes as ordinary user pen-stroke objects;
- invoking an optional `MathInkRecognizer`;
- interpreting recognizer output;
- editable confirmation state;
- graph preview and final plot composition;
- atomic replacement and selection of the created graph;
- accessibility announcements and focus management.

### Existing modules remain authoritative

- `modules/handwritten-function`: capture state, normalization, recognition port,
  conversion, validation and ranking;
- `modules/coordinate-plot-editor`: default coordinate plot and viewport fitting;
- `core`: BoardDocument commands, expression semantics and undoable replacement;
- `adapters/canvas-konva`: world-space pointer capture and preview rendering.

### Deferred

- MyScript or Mathpix HTTP adapters;
- secrets and backend proxying;
- provider-specific retry and quota policy;
- telemetry and production evidence for recognition accuracy.

## Feature exposure

Add `VITE_FEATURE_HANDWRITTEN_FUNCTIONS`.

- development and test default: enabled;
- production default: disabled;
- explicit `true`, `false`, `1` and `0` values follow the existing feature-flag
  parser;
- the toolbar remains available without a recognizer so the manual correction
  path can be exercised; the panel explains that automatic recognition is not
  connected.

`App` accepts an optional `MathInkRecognizer`. The port is the only provider
surface visible to the application workflow.

## Workflow state

Application state combines:

- the immutable `HandwrittenFunctionSessionState` reducer value;
- optional snapshots of persisted source pen strokes;
- optional `HandwrittenFunctionInterpretation`;
- editable expression text;
- an AbortController for the current recognition operation;
- a human-readable workflow diagnostic.

All mutable references mirror React state only where asynchronous callbacks need
current values. The recognizer result is accepted only when its operation and
session remain current.

## Stroke materialization

Completed session strokes become `drawing.pen-stroke` objects with:

- world-coordinate points from the capture session;
- standard pen style;
- user source, no group, identity transform and unlocked state;
- deterministic IDs derived from the session and stroke IDs;
- bounded simplification through the drawing module's public helper.

Before recognition, the strokes exist only in `previewItems`. Materialization is
performed once and committed as one history entry. When recognition is missing,
fails or is cancelled, the materialized ink remains on the board.

## Editable interpretation

The panel shows:

- workflow status and stroke count;
- recognizer diagnostics;
- ordered candidates when more than one valid interpretation exists;
- an editable expression input;
- parameters discovered from the edited expression;
- a blocking validation message when the expression is invalid.

Every edited value is reinterpreted as one native `plot-expression` candidate.
This reuses the production PR 2 pipeline, including parameter discovery and
`compilePlotExpression` validation.

## Plot composition

A pure application helper creates the final coordinate plot:

1. create a default plot centered on the source-ink bounds;
2. retain one explicit series;
3. replace its expression with the validated draft;
4. create parameters in first-occurrence order with defaults `[-10, 10]`, value
   `1` and step `0.1`;
5. name the series `Рукописная функция`;
6. fit the coordinate viewport through `fitCoordinatePlotDefinition`;
7. preserve BoardDocument 1.1 and `tutorboard-expression/1`.

The preview uses the same object snapshot with reduced opacity. The final command
uses the exact persisted source snapshots as `originals`, which lets the reducer
reject stale or externally changed ink.

## Interaction rules

- Pointer input is accepted only while the handwritten tool is active and the
  session is collecting.
- One active pointer is supported by the existing reducer.
- Board pan gestures retain their existing precedence in `BoardStage`.
- A tool switch preserves completed ink and cancels the active recognizer.
- Escape preserves completed ink and closes the panel.
- Clear aborts recognition and removes persisted source ink when present.
- Build graph is disabled during recognition, with invalid input or when source
  snapshots no longer match the document.
- Read-only mode hides or disables mutating controls.

## Accessibility

- toolbar button exposes label, pressed state, shortcut and title;
- panel is a named complementary region rather than a blocking modal;
- recognition status uses `role=status`;
- blocking validation uses `role=alert`;
- candidate controls are keyboard-operable buttons;
- expression input has a persistent label and explanatory text;
- successful recognition, preserved ink, failure and graph creation update the
  existing polite live region;
- Escape and focus behavior remain compatible with the coordinate-plot editor.

## Public helpers

Add pure application composition functions for:

- converting session strokes into pen-stroke objects;
- validating an edited expression through the interpretation API;
- creating the coordinate plot from a validated candidate and source bounds;
- creating the atomic replace command.

The helpers receive IDs and metadata from callers. They read no clock, random,
DOM, React or network state.

## Tests

### Unit

- stroke materialization preserves coordinates and uses deterministic IDs;
- graph composition maps expression and ordered parameters correctly;
- viewport fitting produces a valid coordinate plot;
- replacement command contains exact originals and one replacement;
- reducing the replacement followed by history undo restores all strokes;
- edited-expression validation reuses PR 2 diagnostics.

### Component

- panel renders collecting, recognizing, ambiguous, failed and valid-draft states;
- candidate selection updates the draft;
- build is disabled for invalid input;
- manual fallback remains usable without a recognizer;
- keyboard-accessible controls and labels are present.

### App workflow

With the fake recognizer injected:

- toolbar activation captures multiple strokes;
- recognition commits ink once;
- accepted output produces a graph preview;
- editing updates parameter discovery;
- build emits `core.objects.replace`;
- one undo restores every source pen stroke;
- ambiguous output requires an explicit candidate or edit;
- aborted and failed recognition preserve ink;
- Escape and tool switches preserve input;
- read-only mode prevents the workflow.

### Browser

Add a Chromium/Firefox production-flow scenario using a deterministic in-browser
fake recognizer injected by the test harness. Verify capture, confirmation,
replacement, undo and persistence reload without contacting an external service.

## Release gates

The final head must pass:

- board and GeometryOS contract checks;
- formatting, lint and strict TypeScript;
- all unit and performance tests;
- architecture gate;
- production build;
- browser smoke;
- Chromium and Firefox coordinate-plot production lifecycle;
- handwritten-function browser flow;
- live GeometryOS browser contract;
- production Smart Ink gate;
- immutable non-root production image and security scan.
