from pathlib import Path

root = Path(__file__).resolve().parents[1]
path = root / "scripts/geometryos-contract-lib.mjs"
text = path.read_text(encoding="utf-8")
old = "  writeMetadata(outputRoot, manifest);\n}"
new = '''  writeMetadata(outputRoot, manifest);
  const prettier = path.join(
    repositoryRoot,
    "node_modules/.bin",
    process.platform === "win32" ? "prettier.cmd" : "prettier",
  );
  execFileSync(
    prettier,
    [
      "--write",
      path.join(generatedRoot, "geometryos.types.ts"),
      path.join(generatedRoot, "contract-metadata.ts"),
    ],
    { cwd: repositoryRoot, stdio: "ignore" },
  );
}'''
if old not in text:
    raise RuntimeError("Generated contract finalization hook was not found")
path.write_text(text.replace(old, new, 1), encoding="utf-8")
print("Canonicalized generated TypeScript inside the code-generation boundary.")
