import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  actorId,
  documentId,
  type BoardDocumentRepository,
  type BoardPlatformRepository,
  type GeometryOsClient,
  type PendingBoardCommandQueue,
} from "../core/public";
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

  it("opens the selected lesson board and hides management from students", async () => {
    window.location.hash = "#/documents";
    const platformRepository = {
      context: vi.fn().mockResolvedValue({
        actorId: actorId("actor:student"),
        csrfToken: "csrf",
        organizationId: "organization:1",
        role: "student",
      }),
      listBoards: vi.fn().mockResolvedValue([
        {
          archivedAt: null,
          currentDocumentSha256: "a".repeat(64),
          currentRevision: 4,
          documentId: documentId("document:second"),
          lastSnapshotRevision: 3,
          lessonId: "lesson:42",
          snapshotDue: false,
          studentId: "student:1",
        },
      ]),
    } as unknown as BoardPlatformRepository;
    render(
      <ProductShell
        environment={{
          ...environment,
          features: { ...environment.features, serverSync: true },
        }}
        geometryOsClient={geometryOsClient}
        repository={repository}
        serverSync={{
          documentId: documentId("document:first"),
          lessonId: "lesson:42",
          queue: {} as PendingBoardCommandQueue,
          repository: platformRepository,
        }}
      />,
    );

    await waitFor(() =>
      expect(screen.getByRole("link", { name: "Открыть" })).toHaveAttribute(
        "href",
        "?lessonId=lesson%3A42&documentId=document%3Asecond#/board",
      ),
    );
    expect(screen.queryByRole("button", { name: "В архив" })).toBeNull();
  });
});
