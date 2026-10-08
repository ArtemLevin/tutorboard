import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  type BoardCommand,
  type BoardMediaAssetDescriptor,
  type BoardMediaUploadInput,
} from "../core/public";
import type { BoardMediaUploadSession } from "./media-asset-import";
import { App, createInitialDocument } from "./App";

vi.mock("../adapters/canvas-konva/public", () => ({
  BoardStage: () => (
    <div aria-label="Бесконечное полотно TutorBoard" role="application" />
  ),
  clearCoordinatePlotSamplingCache: vi.fn(),
  createDefaultKonvaRendererRegistry: () => ({}),
}));

const png = new Uint8Array(24);
png.set([137, 80, 78, 71, 13, 10, 26, 10], 0);
png.set([0, 0, 0, 13, 73, 72, 68, 82], 8);
png.set([0, 0, 0, 16], 16);
png.set([0, 0, 0, 12], 20);

beforeEach(() => {
  vi.stubGlobal(
    "createImageBitmap",
    vi.fn(async () => ({ close: vi.fn() })),
  );
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function insertFile(): void {
  fireEvent.click(screen.getByRole("button", { name: "Медиа" }));
  fireEvent.change(screen.getByLabelText("Вставить изображения"), {
    target: {
      files: [new File([png], "classwork.png", { type: "image/png" })],
    },
  });
}

function createSession(
  uploadMedia: (
    input: BoardMediaUploadInput,
  ) => Promise<BoardMediaAssetDescriptor>,
  isCurrent = () => true,
): BoardMediaUploadSession {
  return {
    documentId: createInitialDocument().id,
    getCsrfToken: async () => "csrf:valid",
    isCurrent,
    uploadMedia,
  };
}

function descriptor(input: BoardMediaUploadInput): BoardMediaAssetDescriptor {
  return {
    assetId: "asset:classwork",
    byteSize: input.body.size,
    contentSha256: input.contentSha256,
    createdAt: "2026-10-08T11:00:00.000Z",
    fileName: input.fileName,
    intrinsicSize: { width: 16, height: 12 },
    mimeType: input.mimeType,
    status: "available",
  };
}

describe("synchronized asset import through board UI", () => {
  it("queues no command before upload AVAILABLE and commits reference-only data afterward", async () => {
    let release: (value: BoardMediaAssetDescriptor) => void = () => undefined;
    let captured: BoardMediaUploadInput | null = null;
    const upload = vi.fn((input: BoardMediaUploadInput) => {
      captured = input;
      return new Promise<BoardMediaAssetDescriptor>((resolve) => {
        release = resolve;
      });
    });
    const committed = vi.fn();
    render(
      <App
        initialDocument={createInitialDocument()}
        mediaAssetImportEnabled
        mediaUploadSession={createSession(upload)}
        onCommandCommitted={committed}
      />,
    );
    insertFile();
    await waitFor(() => expect(upload).toHaveBeenCalledOnce());
    expect(committed).not.toHaveBeenCalled();
    expect(screen.getByText("Загружаем изображения…")).toBeInTheDocument();
    expect(captured).not.toBeNull();
    if (captured === null) return;
    await act(async () => release(descriptor(captured!)));
    await waitFor(() => expect(committed).toHaveBeenCalledOnce());

    const command = committed.mock.calls[0]?.[0] as BoardCommand;
    expect(command.kind).toBe("core.objects.add");
    if (command.kind !== "core.objects.add") return;
    expect(command.objects).toHaveLength(1);
    expect(command.objects[0]).toMatchObject({
      kind: "media.asset",
      assetId: "asset:classwork",
      byteSize: png.byteLength,
    });
    expect(command.objects[0]).not.toHaveProperty("dataUrl");
  });

  it("aborts the pending upload and skips command on read-only downgrade", async () => {
    let release: (value: BoardMediaAssetDescriptor) => void = () => undefined;
    let captured: BoardMediaUploadInput | null = null;
    const upload = vi.fn((input: BoardMediaUploadInput) => {
      captured = input;
      return new Promise<BoardMediaAssetDescriptor>((resolve) => {
        release = resolve;
      });
    });
    const session = createSession(upload);
    const committed = vi.fn();
    const doc = createInitialDocument();
    const view = render(
      <App
        initialDocument={doc}
        mediaAssetImportEnabled
        mediaUploadSession={session}
        onCommandCommitted={committed}
      />,
    );
    insertFile();
    await waitFor(() => expect(upload).toHaveBeenCalledOnce());
    view.rerender(
      <App
        initialDocument={doc}
        mediaAssetImportEnabled
        mediaUploadSession={session}
        onCommandCommitted={committed}
        readOnly
      />,
    );
    expect(captured).not.toBeNull();
    if (captured === null) return;
    await act(async () => release(descriptor(captured!)));
    expect(committed).not.toHaveBeenCalled();
  });

  it("rejects raster import without an authorized upload session", async () => {
    const committed = vi.fn();
    render(
      <App
        initialDocument={createInitialDocument()}
        mediaAssetImportEnabled
        onCommandCommitted={committed}
      />,
    );
    insertFile();
    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent(
        "требуется активное подключение",
      ),
    );
    expect(committed).not.toHaveBeenCalled();
  });

  it("does not introduce a command when the upload endpoint fails", async () => {
    const committed = vi.fn();
    const upload = vi.fn(async () => {
      throw new Error("Сервер временно недоступен");
    });
    render(
      <App
        initialDocument={createInitialDocument()}
        mediaAssetImportEnabled
        mediaUploadSession={createSession(upload)}
        onCommandCommitted={committed}
      />,
    );
    insertFile();
    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent(
        "Сервер временно недоступен",
      ),
    );
    expect(committed).not.toHaveBeenCalled();
  });
});
