import { useLayoutEffect, useState, type RefObject } from "react";

export interface ElementSize {
  readonly height: number;
  readonly width: number;
}

const fallbackSize: ElementSize = { height: 1, width: 1 };

export function useElementSize(
  elementRef: RefObject<HTMLElement | null>,
): ElementSize {
  const [size, setSize] = useState<ElementSize>(fallbackSize);

  useLayoutEffect(() => {
    const element = elementRef.current;
    if (element === null) {
      return;
    }

    const update = (width: number, height: number) => {
      setSize({
        width: Math.max(1, Math.round(width)),
        height: Math.max(1, Math.round(height)),
      });
    };
    const bounds = element.getBoundingClientRect();
    update(bounds.width, bounds.height);

    const observer = new ResizeObserver(([entry]) => {
      if (entry !== undefined) {
        update(entry.contentRect.width, entry.contentRect.height);
      }
    });
    observer.observe(element);

    return () => observer.disconnect();
  }, [elementRef]);

  return size;
}
