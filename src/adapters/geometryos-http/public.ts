export const geometryOsAdapterContractVersion = "1.0" as const;

export {
  createGeometryOsHttpClient,
  type GeometryOsHttpClientOptions,
} from "./client";
export { geometryOsRequestIdHeader } from "./request-id";
export { geometryOsContractMetadata } from "./generated/contract-metadata";
