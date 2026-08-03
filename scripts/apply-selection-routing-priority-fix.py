from pathlib import Path

path = Path("src/adapters/canvas-konva/BoardStage.tsx")
source = path.read_text(encoding="utf-8")

before = '''          : isLeftButton && panMode && !shouldSelectHitObject
            ? "hand"
            : null;
'''
after = '''          : isLeftButton &&
              panMode &&
              selectionModeKey === null &&
              !shouldSelectHitObject
            ? "hand"
            : null;
'''

if before in source:
    source = source.replace(before, after, 1)
elif after not in source:
    raise SystemExit("Unexpected pointer source routing block")

path.write_text(source, encoding="utf-8")
