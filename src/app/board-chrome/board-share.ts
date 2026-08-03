export interface BoardShareLocation {
  readonly origin: string;
  readonly pathname: string;
  readonly search: string;
}

export function createBoardShareUrl(location: BoardShareLocation): string {
  return `${location.origin}${location.pathname}${location.search}#/board`;
}

export async function copyBoardShareUrl(
  location: BoardShareLocation,
  clipboard: Pick<Clipboard, "writeText"> | undefined = navigator.clipboard,
): Promise<string> {
  if (clipboard === undefined) {
    throw new Error("Clipboard API is unavailable.");
  }
  const url = createBoardShareUrl(location);
  await clipboard.writeText(url);
  return url;
}
