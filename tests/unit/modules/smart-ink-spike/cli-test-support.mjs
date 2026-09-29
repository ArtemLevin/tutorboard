import { execFile } from "node:child_process";

export const SMART_INK_CLI_TIMEOUT_MS = 10_000;

export class SmartInkCliTimeoutError extends Error {
  constructor({ args, cause, stderr, stdout, timeoutMs }) {
    super(
      `Smart Ink CLI timed out after ${timeoutMs}ms: ${[
        process.execPath,
        ...args,
      ].join(" ")}`,
      { cause },
    );
    this.name = "SmartInkCliTimeoutError";
    this.code = "ERR_TEST_CLI_TIMEOUT";
    this.timeoutMs = timeoutMs;
    this.stdout = stdout;
    this.stderr = stderr;
  }
}

export function runSmartInkCli(
  args,
  { cwd = process.cwd(), timeoutMs = SMART_INK_CLI_TIMEOUT_MS } = {},
) {
  return new Promise((resolve, reject) => {
    execFile(
      process.execPath,
      args,
      {
        cwd,
        killSignal: "SIGKILL",
        timeout: timeoutMs,
        windowsHide: true,
      },
      (error, stdout, stderr) => {
        if (error === null) {
          resolve({ stderr, stdout });
          return;
        }

        if (error.killed === true && error.signal === "SIGKILL") {
          reject(
            new SmartInkCliTimeoutError({
              args,
              cause: error,
              stderr,
              stdout,
              timeoutMs,
            }),
          );
          return;
        }

        error.stderr = stderr;
        error.stdout = stdout;
        reject(error);
      },
    );
  });
}
