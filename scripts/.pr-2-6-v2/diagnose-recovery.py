from pathlib import Path

path = Path("tests/unit/adapters/persistence-dexie/repository.test.ts")
text = path.read_text(encoding="utf-8")
old = '''    const loaded = await repository.load(documentId("document:local-board"));
    expect(loaded.status).toBe("recovery-required");
'''
new = '''    const loaded = await repository.load(documentId("document:local-board"));
    if (loaded.status === "failure") {
      throw new Error(`${loaded.code}: ${loaded.message}`);
    }
    expect(loaded.status).toBe("recovery-required");
'''
if old not in text:
    raise SystemExit("recovery assertion not found")
path.write_text(text.replace(old, new, 1), encoding="utf-8")
