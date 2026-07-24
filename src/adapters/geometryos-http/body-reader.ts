export type BoundedBodyReadResult =
  | { readonly status: "ok"; readonly text: string }
  | { readonly status: "invalid-utf8" }
  | { readonly status: "too-large" };

function declaredLength(response: Response): number | null {
  const value = response.headers.get("Content-Length");
  if (value === null || !/^\d+$/.test(value)) {
    return null;
  }
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : null;
}

export async function readBoundedResponseBody(
  response: Response,
  maxBytes: number,
): Promise<BoundedBodyReadResult> {
  const expectedLength = declaredLength(response);
  if (expectedLength !== null && expectedLength > maxBytes) {
    await response.body?.cancel().catch(() => undefined);
    return { status: "too-large" };
  }

  if (response.body === null) {
    return { status: "ok", text: "" };
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;

  while (true) {
    const item = await reader.read();
    if (item.done) {
      break;
    }
    totalBytes += item.value.byteLength;
    if (totalBytes > maxBytes) {
      await reader.cancel().catch(() => undefined);
      return { status: "too-large" };
    }
    chunks.push(item.value);
  }

  const body = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }

  try {
    return {
      status: "ok",
      text: new TextDecoder("utf-8", { fatal: true }).decode(body),
    };
  } catch (error) {
    if (error instanceof TypeError) {
      return { status: "invalid-utf8" };
    }
    throw error;
  }
}
