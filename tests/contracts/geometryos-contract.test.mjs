// @vitest-environment node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { geometryOsContractMetadata } from "../../src/adapters/geometryos-http/public.ts";
import {
  validateGenerateRequest,
  validateGenerateResponse,
  validateProblemDetail,
} from "../../src/adapters/geometryos-http/validation.ts";

const root = path.resolve(process.cwd(), "contracts/geometryos");

function json(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function sha256(filePath) {
  return crypto
    .createHash("sha256")
    .update(fs.readFileSync(filePath))
    .digest("hex");
}

function collectJsonFiles(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const value = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      return collectJsonFiles(value);
    }
    return entry.name.endsWith(".json") ? [value] : [];
  });
}

function visit(value, callback) {
  callback(value);
  if (Array.isArray(value)) {
    for (const item of value) {
      visit(item, callback);
    }
  } else if (value !== null && typeof value === "object") {
    for (const item of Object.values(value)) {
      visit(item, callback);
    }
  }
}

describe("pinned GeometryOS contract", () => {
  it("matches the approved artifact hashes and metadata", () => {
    const manifest = json(path.join(root, "contract-manifest.json"));
    expect(sha256(path.join(root, "openapi.v1.json"))).toBe(
      manifest.openApiSha256,
    );
    expect(sha256(path.join(root, "gir.schema.v0.2.json"))).toBe(
      manifest.girSchemaSha256,
    );
    expect(sha256(path.join(root, "fixtures/manifest.json"))).toBe(
      manifest.fixtureManifestSha256,
    );
    expect(geometryOsContractMetadata).toMatchObject({
      sourceCommit: manifest.sourceCommit,
      openApiVersion: "1.0.0",
      apiMajor: "v1",
      girSchemaVersion: "0.2.0",
      consumerContract: "tutorboard/v1",
    });
  });

  it("validates producer consumer fixtures through generated validators", () => {
    const counts = { request: 0, response: 0, problem: 0 };
    for (const filePath of collectJsonFiles(path.join(root, "fixtures"))) {
      if (filePath.endsWith(`${path.sep}manifest.json`)) {
        continue;
      }
      visit(json(filePath), (candidate) => {
        if (candidate === null || typeof candidate !== "object") {
          return;
        }
        if (
          candidate.input_type === "text" &&
          typeof candidate.input === "string" &&
          validateGenerateRequest(candidate).valid
        ) {
          counts.request += 1;
        }
        if (
          ["success", "needs_clarification", "error"].includes(
            String(candidate.status),
          ) &&
          validateGenerateResponse(candidate).valid
        ) {
          counts.response += 1;
        }
        if (
          typeof candidate.status === "number" &&
          typeof candidate.request_id === "string" &&
          typeof candidate.code === "string" &&
          validateProblemDetail(candidate).valid
        ) {
          counts.problem += 1;
        }
      });
    }
    expect(counts.request).toBeGreaterThan(0);
    expect(counts.response).toBeGreaterThan(0);
    expect(counts.problem).toBeGreaterThan(0);
  });
});
