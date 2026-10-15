import { execFileSync } from "node:child_process";
import { existsSync, rmSync } from "node:fs";
import path from "node:path";

import { BACKEND_DIR, E2E_DIR, STATE_PATH } from "./state";

/** Remove the throwaway school and the saved sign-in details. */
export default async function globalTeardown() {
  if (existsSync(STATE_PATH)) {
    execFileSync("uv", ["run", "python", "scripts/e2e_school.py", "cleanup", STATE_PATH], {
      cwd: BACKEND_DIR,
      stdio: "inherit",
    });
    rmSync(STATE_PATH);
  }
  rmSync(path.join(E2E_DIR, ".auth"), { recursive: true, force: true });
}
