import { expect, test } from "bun:test";

import { countText, mayHaveMore } from "@/lib/dashboard";

test("countText shows a full list as a lower bound", () => {
  expect(countText(0)).toBe("0");
  expect(countText(199)).toBe("199");
  expect(countText(200)).toBe("200+");
  expect(countText(6, 6)).toBe("6+");
});

test("mayHaveMore only when every row read was today and the list was full", () => {
  expect(mayHaveMore(200, 200)).toBe(true);
  expect(mayHaveMore(150, 200)).toBe(false);
  expect(mayHaveMore(40, 40)).toBe(false);
});
