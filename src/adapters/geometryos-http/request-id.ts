import {
  geometryOsRequestId,
  type GeometryOsRequestId,
} from "../../core/public";

export const geometryOsRequestIdHeader = "X-Request-ID" as const;

export function createDefaultGeometryOsRequestId(): GeometryOsRequestId {
  if (typeof globalThis.crypto?.randomUUID !== "function") {
    throw new Error(
      "Web Crypto randomUUID is required for GeometryOS requests.",
    );
  }
  return geometryOsRequestId(`tutorboard-${globalThis.crypto.randomUUID()}`);
}
