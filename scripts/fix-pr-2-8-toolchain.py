from pathlib import Path
import json

ROOT = Path(__file__).resolve().parents[1]

tool_root = ROOT / "tools/geometryos-contract"
tool_root.mkdir(parents=True, exist_ok=True)
(tool_root / "package.json").write_text(
    json.dumps(
        {
            "name": "tutorboard-geometryos-contract-tools",
            "private": True,
            "version": "0.0.0",
            "type": "module",
            "devDependencies": {
                "ajv": "8.17.1",
                "openapi-typescript": "7.13.0",
                "typescript": "5.9.3",
            },
        },
        indent=2,
    )
    + "\n",
    encoding="utf-8",
)

library_path = ROOT / "scripts/geometryos-contract-lib.mjs"
text = library_path.read_text(encoding="utf-8")
text = text.replace(
    'import { fileURLToPath } from "node:url";\n\nimport Ajv2020 from "ajv/dist/2020.js";\nimport standaloneCode from "ajv/dist/standalone/index.js";',
    'import { createRequire } from "node:module";\nimport { fileURLToPath } from "node:url";',
)
text = text.replace(
    'const contractRoot = path.join(repositoryRoot, "contracts/geometryos");',
    'const contractRoot = path.join(repositoryRoot, "contracts/geometryos");\nconst toolRoot = path.join(repositoryRoot, "tools/geometryos-contract");\nconst toolRequire = createRequire(path.join(toolRoot, "package.json"));\nconst Ajv2020 = toolRequire("ajv/dist/2020").default;\nconst standaloneCode = toolRequire("ajv/dist/standalone").default;',
)
text = text.replace(
    '    repositoryRoot,\n    "node_modules/.bin",',
    '    toolRoot,\n    "node_modules/.bin",',
)
library_path.write_text(text, encoding="utf-8")

print("Isolated GeometryOS code generation from the TutorBoard TypeScript compiler.")
