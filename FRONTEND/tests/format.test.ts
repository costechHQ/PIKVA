import { describe, expect, test } from "bun:test";

import { firstName, initials } from "@/lib/format";

describe("initials", () => {
  test("uses the first and last words", () => {
    expect(initials("Ada Okafor")).toBe("AO");
    expect(initials("ada chioma okafor")).toBe("AO");
  });

  test("handles one word, extra spaces and blank names", () => {
    expect(initials("Ada")).toBe("A");
    expect(initials("  Ada   Okafor  ")).toBe("AO");
    expect(initials("   ")).toBe("?");
  });
});

describe("firstName", () => {
  test("returns the first word", () => {
    expect(firstName("Ada Okafor")).toBe("Ada");
    expect(firstName("  Ada  ")).toBe("Ada");
  });
});
