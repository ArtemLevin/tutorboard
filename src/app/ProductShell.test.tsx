import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { GeometryOsClient } from "../adapters/geometryos-http/public";
import type { BoardDocumentRepository } from "../adapters/persistence-dexie/public";
import type { AppEnvironment } from "./configuration/environment";
import { ProductShell } from "./ProductShell";

vi.mock("./PersistedApp", () => ({
  PersistedApp: ({
    onDocumentInfo,
    onNotification,
  }: {
    onDocumentInfo?:
      | ((value: {
          readonly title: string;
          readonly updatedAt: string;
        }) => void)
      | undefined;
    onNotification?:
      | ((value: {
          readonly kind: "error" | "info" | "success";
          readonly message: string;
        }) => void)
      | undefined;
  }) => (
    <main>
      <button
        onClick={() =>
          onDocumentInfo?.({
            title: "Algebra lesson",
            updatedAt: "2026-08-02T15:00:00.000Z",
          })
        }
        type="button"
      >
        Update document
      </button>
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
    handwrittenFunctions: true,
    serverSync: false,
    smartInk: true,
    smartInkDiagnostics: true,
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
  it("renders the workspace route and updates document metadata", () => {
    render(
      <ProductShell
        environment={environment}
        geometryOsClient={geometryOsClient}
        repository={repository}
      />,
    );

    expect(screen.getByText("Без названия")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Update document" }));
    expect(screen.getByText("Algebra lesson")).toBeInTheDocument();
    expect(screen.getByText(/2 августа 2026/)).toBeInTheDocument();
  });

  it("shows and dismisses workspace notifications", () => {
    render(
      <ProductShell
        environment={environment}
        geometryOsClient={geometryOsClient}
        repository={repository}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Notify" }));
    expect(screen.getByText("Document exported")).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", { name: "Закрыть уведомление" }),
    );
    expect(screen.queryByText("Document exported")).not.toBeInTheDocument();
  });
});
