from pathlib import Path

path = Path("tests/unit/adapters/persistence-dexie/repository.test.ts")
text = path.read_text(encoding="utf-8")
old = '''    repository.close();
    await corruptAllRevisions(databaseName);

    const loaded = await repository.load(documentId("document:local-board"));
    expect(loaded.status).toBe("recovery-required");
'''
new = '''    repository.close();
    await corruptAllRevisions(databaseName);

    const reopenedRepository = new DexieBoardDocumentRepository(databaseName);
    repositories.push(reopenedRepository);
    const loaded = await reopenedRepository.load(
      documentId("document:local-board"),
    );
    expect(loaded.status).toBe("recovery-required");
'''
if old not in text:
    raise SystemExit("closed-repository recovery scenario not found")
path.write_text(text.replace(old, new, 1), encoding="utf-8")
