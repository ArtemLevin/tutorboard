import DOMPurify from "dompurify";

import {
  svgSanitizerPolicyVersion,
  type Size2,
  type SvgViewBox,
} from "../../core/public";
import { svgImportLimits } from "./limits";

const svgNamespace = "http://www.w3.org/2000/svg";
const allowedTags = new Set([
  "circle",
  "clipPath",
  "defs",
  "desc",
  "ellipse",
  "g",
  "line",
  "linearGradient",
  "path",
  "polygon",
  "polyline",
  "radialGradient",
  "rect",
  "stop",
  "svg",
  "text",
  "title",
  "tspan",
]);
const allowedAttributes = new Set([
  "clip-path",
  "clip-rule",
  "cx",
  "cy",
  "d",
  "dominant-baseline",
  "fill",
  "fill-opacity",
  "fill-rule",
  "font-family",
  "font-size",
  "font-weight",
  "height",
  "id",
  "offset",
  "opacity",
  "points",
  "preserveAspectRatio",
  "r",
  "rx",
  "ry",
  "stop-color",
  "stop-opacity",
  "stroke",
  "stroke-linecap",
  "stroke-linejoin",
  "stroke-opacity",
  "stroke-width",
  "text-anchor",
  "transform",
  "viewBox",
  "width",
  "x",
  "x1",
  "x2",
  "xmlns",
  "y",
  "y1",
  "y2",
]);
const urlAttributes = new Set(["clip-path", "fill", "stroke"]);
const localUrlPattern = /^url\(#[A-Za-z_][A-Za-z0-9_.:-]*\)$/;
const safeIdPattern = /^[A-Za-z_][A-Za-z0-9_.:-]{0,255}$/;
const dimensionPattern = /^([0-9]+(?:\.[0-9]+)?)(?:px)?$/;

export interface SvgImportDiagnostic {
  readonly attribute?: string;
  readonly code: string;
  readonly element?: string;
  readonly message: string;
}

export interface SanitizedSvg {
  readonly sanitizedSvg: string;
  readonly sanitizerPolicyVersion: typeof svgSanitizerPolicyVersion;
  readonly size: Size2;
  readonly viewBox: SvgViewBox;
}

export type SanitizeSvgResult =
  | { readonly status: "ok"; readonly value: SanitizedSvg }
  | { readonly diagnostic: SvgImportDiagnostic; readonly status: "error" };

function failure(
  code: string,
  message: string,
  context: { readonly attribute?: string; readonly element?: string } = {},
): SanitizeSvgResult {
  return { status: "error", diagnostic: { code, message, ...context } };
}

function utf8Length(value: string): number {
  return new TextEncoder().encode(value).byteLength;
}

function finiteNumber(value: string): number | null {
  if (value.trim().length === 0) {
    return null;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseDimension(value: string | null): number | null {
  if (value === null) {
    return null;
  }
  const match = dimensionPattern.exec(value.trim());
  if (match === null) {
    return null;
  }
  const parsed = Number(match[1]);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function parseViewBox(root: Element): SvgViewBox | null {
  const raw = root.getAttribute("viewBox");
  if (raw === null) {
    const width = parseDimension(root.getAttribute("width"));
    const height = parseDimension(root.getAttribute("height"));
    return width === null || height === null
      ? null
      : { height, width, x: 0, y: 0 };
  }

  const values = raw
    .trim()
    .split(/[\s,]+/)
    .map(finiteNumber);
  if (values.length !== 4 || values.some((value) => value === null)) {
    return null;
  }
  const [x, y, width, height] = values as [number, number, number, number];
  return width > 0 && height > 0 ? { height, width, x, y } : null;
}

function displaySize(viewBox: SvgViewBox): Size2 {
  const scale = Math.min(1, 480 / Math.max(viewBox.width, viewBox.height));
  return {
    height: Math.max(1, viewBox.height * scale),
    width: Math.max(1, viewBox.width * scale),
  };
}

function escapeText(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function escapeAttribute(value: string): string {
  return escapeText(value).replaceAll('"', "&quot;");
}

function canonicalElement(element: Element): string {
  const attributes = [...element.attributes]
    .map((attribute) => [attribute.name, attribute.value] as const)
    .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
    .map(([name, value]) => ` ${name}="${escapeAttribute(value)}"`)
    .join("");
  const children = [...element.childNodes]
    .map((child) => {
      if (child.nodeType === Node.ELEMENT_NODE) {
        return canonicalElement(child as Element);
      }
      if (child.nodeType === Node.TEXT_NODE) {
        return escapeText(child.textContent ?? "");
      }
      return "";
    })
    .join("");
  return `<${element.localName}${attributes}>${children}</${element.localName}>`;
}

interface Inspection {
  readonly ids: ReadonlySet<string>;
  readonly root: SVGSVGElement;
  readonly viewBox: SvgViewBox;
}

function inspectSvg(source: string): SanitizeSvgResult | Inspection {
  if (utf8Length(source) > svgImportLimits.maxInputBytes) {
    return failure(
      "svg.input-too-large",
      "SVG exceeds the allowed byte limit.",
    );
  }
  if (/<!DOCTYPE|<!ENTITY|<\?(?:xml-stylesheet|xml-model)/i.test(source)) {
    return failure(
      "svg.xml-feature-forbidden",
      "DOCTYPE, entities and XML processing instructions are forbidden.",
    );
  }

  const document = new DOMParser().parseFromString(source, "image/svg+xml");
  if (document.querySelector("parsererror") !== null) {
    return failure("svg.invalid-xml", "SVG is not well-formed XML.");
  }
  const root = document.documentElement;
  if (root.namespaceURI !== svgNamespace || root.localName !== "svg") {
    return failure("svg.invalid-root", "The root element must be SVG.");
  }

  const ids = new Set<string>();
  let nodeCount = 0;
  let totalAttributes = 0;
  let pathCharacters = 0;
  let rejection: SanitizeSvgResult | null = null;

  const visit = (element: Element, depth: number): void => {
    if (rejection !== null) {
      return;
    }
    nodeCount += 1;
    if (nodeCount > svgImportLimits.maxNodes) {
      rejection = failure(
        "svg.node-limit-exceeded",
        "SVG contains too many elements.",
      );
      return;
    }
    if (depth > svgImportLimits.maxDepth) {
      rejection = failure(
        "svg.depth-limit-exceeded",
        "SVG nesting is too deep.",
      );
      return;
    }
    if (
      element.namespaceURI !== svgNamespace ||
      !allowedTags.has(element.localName)
    ) {
      rejection = failure(
        "svg.forbidden-element",
        "SVG contains an unsupported element.",
        { element: element.localName },
      );
      return;
    }
    if (element.attributes.length > svgImportLimits.maxAttributesPerElement) {
      rejection = failure(
        "svg.attribute-limit-exceeded",
        "An SVG element contains too many attributes.",
        { element: element.localName },
      );
      return;
    }

    totalAttributes += element.attributes.length;
    if (totalAttributes > svgImportLimits.maxTotalAttributes) {
      rejection = failure(
        "svg.attribute-limit-exceeded",
        "SVG contains too many attributes.",
      );
      return;
    }

    for (const attribute of [...element.attributes]) {
      const name = attribute.name;
      const value = attribute.value.trim();
      if (/^on/i.test(name) || name === "style") {
        rejection = failure(
          "svg.forbidden-attribute",
          "SVG contains an executable or unsupported attribute.",
          { attribute: name, element: element.localName },
        );
        return;
      }
      if (!allowedAttributes.has(name)) {
        rejection = failure(
          "svg.forbidden-attribute",
          "SVG contains an unsupported attribute.",
          { attribute: name, element: element.localName },
        );
        return;
      }
      if (name === "id") {
        if (!safeIdPattern.test(value) || ids.has(value)) {
          rejection = failure(
            "svg.invalid-id",
            "SVG IDs must be unique and locally referenceable.",
            { attribute: name, element: element.localName },
          );
          return;
        }
        ids.add(value);
      }
      if (urlAttributes.has(name) && /url\s*\(/i.test(value)) {
        if (!localUrlPattern.test(value)) {
          rejection = failure(
            "svg.external-reference",
            "Only local fragment references are allowed.",
            { attribute: name, element: element.localName },
          );
          return;
        }
      }
      if (name === "xmlns" && value !== svgNamespace) {
        rejection = failure(
          "svg.invalid-namespace",
          "SVG namespace declarations must use the SVG namespace.",
          { attribute: name, element: element.localName },
        );
        return;
      }
      if (
        name !== "xmlns" &&
        /^(?:https?:|data:|javascript:|blob:|file:|ftp:|\/\/)/i.test(value)
      ) {
        rejection = failure(
          "svg.unsafe-url",
          "External and executable URLs are forbidden.",
          { attribute: name, element: element.localName },
        );
        return;
      }
      if (name === "d") {
        pathCharacters += value.length;
      }
    }
    if (pathCharacters > svgImportLimits.maxPathDataCharacters) {
      rejection = failure(
        "svg.path-limit-exceeded",
        "SVG path data is too large.",
      );
      return;
    }

    for (const child of [...element.children]) {
      visit(child, depth + 1);
    }
  };

  visit(root, 1);
  if (rejection !== null) {
    return rejection;
  }

  for (const element of [root, ...root.querySelectorAll("*")]) {
    for (const name of urlAttributes) {
      const value = element.getAttribute(name);
      const match = value === null ? null : /^url\(#([^)]*)\)$/.exec(value);
      if (match !== null && !ids.has(match[1] ?? "")) {
        return failure(
          "svg.missing-local-reference",
          "SVG references a missing local resource.",
          { attribute: name, element: element.localName },
        );
      }
    }
  }

  const viewBox = parseViewBox(root);
  if (viewBox === null) {
    return failure(
      "svg.invalid-viewbox",
      "SVG requires a positive viewBox or numeric width and height.",
    );
  }
  if (
    viewBox.width > svgImportLimits.maxViewBoxSpan ||
    viewBox.height > svgImportLimits.maxViewBoxSpan ||
    Math.abs(viewBox.x) > svgImportLimits.maxViewBoxSpan ||
    Math.abs(viewBox.y) > svgImportLimits.maxViewBoxSpan
  ) {
    return failure(
      "svg.dimension-limit-exceeded",
      "SVG viewBox exceeds the allowed coordinate range.",
    );
  }
  const ratio = Math.max(
    viewBox.width / viewBox.height,
    viewBox.height / viewBox.width,
  );
  if (ratio > svgImportLimits.maxAspectRatio) {
    return failure(
      "svg.aspect-ratio-limit-exceeded",
      "SVG aspect ratio exceeds the allowed limit.",
    );
  }

  return { ids, root: root as unknown as SVGSVGElement, viewBox };
}

export function sanitizeSvg(source: string): SanitizeSvgResult {
  const inspected = inspectSvg(source);
  if ("status" in inspected) {
    return inspected;
  }

  const purified = String(
    DOMPurify.sanitize(source, {
      ALLOWED_ATTR: [...allowedAttributes],
      ALLOWED_TAGS: [...allowedTags],
      FORBID_ATTR: ["style"],
      FORBID_TAGS: [
        "a",
        "animate",
        "animateMotion",
        "animateTransform",
        "audio",
        "canvas",
        "embed",
        "filter",
        "foreignObject",
        "iframe",
        "image",
        "link",
        "meta",
        "object",
        "script",
        "set",
        "style",
        "video",
      ],
      NAMESPACE: svgNamespace,
      RETURN_TRUSTED_TYPE: false,
    }),
  );
  const post = inspectSvg(purified);
  if ("status" in post) {
    return failure(
      "svg.sanitization-mismatch",
      "SVG failed validation after sanitization.",
    );
  }

  const size = displaySize(post.viewBox);
  if (
    size.width > svgImportLimits.maxDimension ||
    size.height > svgImportLimits.maxDimension
  ) {
    return failure(
      "svg.dimension-limit-exceeded",
      "SVG rendered dimensions exceed the allowed limit.",
    );
  }
  post.root.setAttribute("xmlns", svgNamespace);
  post.root.setAttribute(
    "viewBox",
    `${post.viewBox.x} ${post.viewBox.y} ${post.viewBox.width} ${post.viewBox.height}`,
  );
  post.root.setAttribute("width", String(size.width));
  post.root.setAttribute("height", String(size.height));
  const sanitizedSvg = canonicalElement(post.root);
  if (utf8Length(sanitizedSvg) > svgImportLimits.maxSanitizedBytes) {
    return failure(
      "svg.sanitized-output-too-large",
      "Sanitized SVG exceeds the allowed byte limit.",
    );
  }

  return {
    status: "ok",
    value: {
      sanitizedSvg,
      sanitizerPolicyVersion: svgSanitizerPolicyVersion,
      size,
      viewBox: post.viewBox,
    },
  };
}
