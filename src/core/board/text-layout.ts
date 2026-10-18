import type { ObjectStyle } from "./objects";

export const textAutoWrapColumns = 20;

/** Layout-only: preserve source text and safe-math syntax for editing and undo. */
export function wrapBoardText(value: string): string {
  return value
    .replaceAll("\r\n", "\n")
    .split("\n")
    .map((line) => {
      const chars = Array.from(line);
      const result: string[] = [];
      let start = 0;
      while (chars.length - start > textAutoWrapColumns) {
        let boundary = -1;
        for (let i = start + textAutoWrapColumns; i > start; i -= 1) {
          if (chars[i] === " ") {
            boundary = i;
            break;
          }
        }
        if (boundary > start) {
          result.push(chars.slice(start, boundary).join("").trimEnd());
          start = boundary + 1;
          while (chars[start] === " ") start += 1;
        } else {
          result.push(chars.slice(start, start + textAutoWrapColumns).join(""));
          start += textAutoWrapColumns;
        }
      }
      result.push(chars.slice(start).join(""));
      return result.join("\n");
    })
    .join("\n");
}

export function resolveTextTypography(style: ObjectStyle) {
  const family = style.fontFamily ?? "sans";
  const bold = style.fontWeight === "bold";
  const italic = style.fontStyle === "italic";
  return {
    fontFamily:
      family === "serif"
        ? "Georgia, Times New Roman, serif"
        : family === "mono"
          ? "ui-monospace, SFMono-Regular, Consolas, monospace"
          : "Inter, ui-sans-serif, system-ui",
    fontSize: style.fontSize ?? 22,
    fontStyle: bold
      ? italic
        ? "bold italic"
        : "bold"
      : italic
        ? "italic"
        : "normal",
    fontWeight: bold ? "bold" : "normal",
    italic,
    lineHeight: style.lineHeight ?? 1.35,
  } as const;
}

/** Conservative glyph estimates used by hit testing, eraser and culling. */
export function textLineMetrics(value: string) {
  const lines = wrapBoardText(value).split("\n");
  let maximumCharacters = 1;
  for (const line of lines) {
    maximumCharacters = Math.max(maximumCharacters, Array.from(line).length);
  }
  return { lineCount: lines.length, maximumCharacters };
}
