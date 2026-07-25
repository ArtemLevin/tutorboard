import path from "node:path";
import { execFileSync } from "node:child_process";

import {
  checkGeneratedContract,
  repositoryRoot,
} from "./geometryos-contract-lib.mjs";

checkGeneratedContract();
execFileSync(
  process.execPath,
  [path.join(repositoryRoot, "scripts/check-geometryos-validator-runtime.mjs")],
  {
    cwd: repositoryRoot,
    stdio: "inherit",
  },
);
console.log("GeometryOS contract artifacts and generated output are current.");
