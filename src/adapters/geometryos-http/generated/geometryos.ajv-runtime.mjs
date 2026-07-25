import ucs2lengthModule from "ajv/dist/runtime/ucs2length.js";

const ucs2length =
  typeof ucs2lengthModule === "function"
    ? ucs2lengthModule
    : ucs2lengthModule.default;

if (typeof ucs2length !== "function") {
  throw new TypeError("Ajv ucs2length runtime helper is unavailable.");
}

export { ucs2length };
