from pathlib import Path

root = Path(__file__).resolve().parents[1]
path = root / "scripts/geometryos-contract-lib.mjs"
text = path.read_text(encoding="utf-8")
old = '''  const validateGenerateRequest = ajv.compile(
    bundledSchema(
      components.GenerateV1Request,
      components,
      "urn:tutorboard:geometryos:generate-request",
    ),
  );
  const validateGenerateResponse = ajv.compile(
    bundledSchema(
      responseSchema,
      components,
      "urn:tutorboard:geometryos:generate-response",
    ),
  );
  const validateProblemDetail = ajv.compile(
    bundledSchema(
      components.ProblemDetail,
      components,
      "urn:tutorboard:geometryos:problem-detail",
    ),
  );
  return standaloneCode(ajv, {
    validateGenerateRequest,
    validateGenerateResponse,
    validateProblemDetail,
  });'''
new = '''  const schemaIds = {
    validateGenerateRequest: "urn:tutorboard:geometryos:generate-request",
    validateGenerateResponse: "urn:tutorboard:geometryos:generate-response",
    validateProblemDetail: "urn:tutorboard:geometryos:problem-detail",
  };
  ajv.addSchema(
    bundledSchema(
      components.GenerateV1Request,
      components,
      schemaIds.validateGenerateRequest,
    ),
  );
  ajv.addSchema(
    bundledSchema(
      responseSchema,
      components,
      schemaIds.validateGenerateResponse,
    ),
  );
  ajv.addSchema(
    bundledSchema(
      components.ProblemDetail,
      components,
      schemaIds.validateProblemDetail,
    ),
  );
  return standaloneCode(ajv, schemaIds);'''
if old not in text:
    raise RuntimeError("Standalone validator generation block was not found")
path.write_text(text.replace(old, new, 1), encoding="utf-8")
print("Configured Ajv standalone exports through stable schema identifiers.")
