import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { BoardDocumentRepository, GeometryOsClient } from "../core/public";
import {
  ProductErrorBoundary,
  ProductShell,
  resolveProductRoute,
} from "./ProductShell";
import type { AppEnvironment } from "./configuration/environment";
import type { ProductNotification } from "./PersistedApp";

vi.mock("./PersistedApp", () => ({
  PersistedApp: ({
    onNotification,
  }: {
    readonly onNotification?: (notification: ProductNotification) => void;
  }) => (
    <main>
      <h1>Mock board</h1>
      <button
        onClick={() =>
          onNotification?.({
            kind: "success",
            message: "Document exported",
          })
        }
        type="button"
      >
        Notify
      </button>
    </main>
  ),
}));

const environment: AppEnvironment = {
  boardApiBaseUrl: "/api/v1",
  features: {
    developmentDiagnostics: true,
    documentSnapshots: true,
    geometryPrompt: true,
    serverSync: false,
  },
  geometryOsBaseUrl: "https://geometry.example.test",
  stage: "test",
};

const repository = {} as BoardDocumentRepository;
const geometryOsClient = {} as GeometryOsClient;

afterEach(() => {
  cleanup();
  window.location.hash = "";
  vi.restoreAllMocks();
});

describe("ProductShell", () => {
  it("normalizes known and unknown hash routes", () => {
    expect(resolveProductRoute("")).toBe("board");
    expect(resolveProductRoute("#/documents/")).toBe("documents");
    expect(resolveProductRoute("#/settings")).toBe("settings");
    expect(resolveProductRoute("#/unknown")).toBe("board");
  });

  it("renders routed placeholders and product notifications", () => {
    window.location.hash = "#/documents";
    const { unmount } = render(
      <ProductShell
        environment={environment}
        geometryOsClient={geometryOsClient}
        repository={repository}
      />,
    );
    expect(
      screen.getByRole("heading", { name: "Документы" }),
    ).toBeInTheDocument();
    unmount();

    window.location.hash = "#/board";
    render(
      <ProductShell
        environment={environment}
        geometryOsClient={geometryOsClient}
        repository={repository}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Notify" }));
    expect(screen.getByText("Document exported")).toBeInTheDocument();
  });

  it("contains route failures and offers diagnostics recovery", () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    function Failure(): never {
      throw new Error("Route failed");
    }
    render(
      <ProductErrorBoundary>
        <Failure />
      </ProductErrorBoundary>,
    );
    expect(
      screen.getByRole("heading", { name: "Не удалось открыть TutorBoard" }),
    ).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", { name: "Открыть диагностику" }),
    );
    expect(window.location.hash).toBe("#/diagnostics");
  });
});
