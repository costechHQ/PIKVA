import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import path from "node:path";

import { type FullConfig, request } from "@playwright/test";

import { BACKEND_DIR, E2E_DIR, type Role, STATE_PATH, authFile, readState } from "./state";

/**
 * Create the throwaway school, then sign in once per role through the web
 * app's login route and save each session, so tests start signed in and
 * the login rate limit is never at risk.
 */
export default async function globalSetup(config: FullConfig) {
  // A run that crashed before teardown leaves its school behind: remove it first.
  if (existsSync(STATE_PATH)) {
    execFileSync("uv", ["run", "python", "scripts/e2e_school.py", "cleanup", STATE_PATH], {
      cwd: BACKEND_DIR,
      stdio: "inherit",
    });
  }
  execFileSync("uv", ["run", "python", "scripts/e2e_school.py", "create", STATE_PATH], {
    cwd: BACKEND_DIR,
    stdio: "inherit",
  });

  const state = readState();
  const baseURL = config.projects[0].use.baseURL;
  mkdirSync(path.join(E2E_DIR, ".auth"), { recursive: true });

  for (const role of ["admin", "parent", "gate"] as Role[]) {
    const context = await request.newContext({ baseURL });
    const response = await context.post("/api/auth/login", {
      data: { email: state[role].email, password: state.password },
    });
    if (!response.ok()) throw new Error(`Signing in as ${role} failed: HTTP ${response.status()}`);
    await context.storageState({ path: authFile(role) });
    await context.dispose();
  }
}
