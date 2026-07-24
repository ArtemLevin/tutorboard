from pathlib import Path

root = Path(__file__).resolve().parents[1]
path = root / "tests/unit/adapters/geometryos-http/client.test.ts"
text = path.read_text(encoding="utf-8")
old = '''    const [url, init] = call;
    expect(String(url)).toBe("https://geometry.example.test/api/v1/generate");
    expect(init?.method).toBe("POST");
    expect(new Headers(init?.headers).get("X-Request-ID")).toBe(requestId);
    expect(JSON.parse(String(init?.body))).toEqual({'''
new = '''    const [url, init] = call;
    const requestedUrl =
      typeof url === "string"
        ? url
        : url instanceof URL
          ? url.href
          : url.url;
    expect(requestedUrl).toBe(
      "https://geometry.example.test/api/v1/generate",
    );
    expect(init?.method).toBe("POST");
    expect(new Headers(init?.headers).get("X-Request-ID")).toBe(requestId);
    if (typeof init?.body !== "string") {
      throw new TypeError("Expected a JSON string request body.");
    }
    expect(JSON.parse(init.body)).toEqual({'''
if old not in text:
    raise RuntimeError("GeometryOS request assertion block was not found")
path.write_text(text.replace(old, new, 1), encoding="utf-8")
print("Narrowed GeometryOS request URL and body assertions.")
