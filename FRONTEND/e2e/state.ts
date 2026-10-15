/** The throwaway school global-setup creates, shared by every browser test. */
import { readFileSync } from "node:fs";
import path from "node:path";

export const E2E_DIR = __dirname;
export const STATE_PATH = path.join(E2E_DIR, ".state.json");
export const BACKEND_DIR = path.resolve(E2E_DIR, "..", "..", "BACKEND");

export type Role = "admin" | "parent" | "gate";

type Person = { id: number; name: string; email: string };

export type E2EState = {
  school_id: number;
  tag: string;
  password: string;
  admin: Person;
  parent: Person;
  gate: Person;
  pupil: { id: number; first_name: string; last_name: string };
};

export function readState(): E2EState {
  return JSON.parse(readFileSync(STATE_PATH, "utf8")) as E2EState;
}

/** Saved signed-in browser state for a role (cookies only). */
export function authFile(role: Role): string {
  return path.join(E2E_DIR, ".auth", `${role}.json`);
}
