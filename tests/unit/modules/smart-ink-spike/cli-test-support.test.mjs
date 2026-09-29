import { describe, expect, it } from "vitest";

import {
  SmartInkCliTimeoutError,
  runSmartInkCli,
} from "./cli-test-support.mjs";

describe("Smart Ink CLI test subprocess lifecycle", () => {
  it("kills a CLI process that exceeds its hard timeout", async () => {
    const startedAt = Date.now();

    await expect(
      runSmartInkCli(["-e", "setInterval(() => {}, 1_000)"], {
        timeoutMs: 150,
      }),
    ).rejects.toMatchObject({
      code: "ERR_TEST_CLI_TIMEOUT",
      name: SmartInkCliTimeoutError.name,
      timeoutMs: 150,
    });

    expect(Date.now() - startedAt).toBeLessThan(2_000);
  }, 3_000);
});
