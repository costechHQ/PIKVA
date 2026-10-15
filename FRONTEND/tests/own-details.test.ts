import { expect, test } from "bun:test";

import { ownDetailsChanges } from "@/lib/own-details";

const me = { name: "Ngozi Okafor", phone: "0700000003" };

test("sends only what changed, trimmed", () => {
  expect(ownDetailsChanges(me, { name: " Ngozi Okafor ", phone: " 0711111111 " })).toEqual({ body: { phone: "0711111111" } });
  expect(ownDetailsChanges(me, { name: me.name, phone: me.phone })).toEqual({ body: {} });
  expect(ownDetailsChanges({ name: "A", phone: null }, { name: "A", phone: "0700" })).toEqual({ body: { phone: "0700" } });
});

test("checks name and phone", () => {
  expect(ownDetailsChanges(me, { name: " ", phone: me.phone })).toEqual({ error: "Enter your full name." });
  expect(ownDetailsChanges(me, { name: "x".repeat(151), phone: me.phone })).toEqual({
    error: "Your name can be at most 150 characters.",
  });
  expect(ownDetailsChanges(me, { name: me.name, phone: "" })).toEqual({ error: "Enter your phone number." });
  expect(ownDetailsChanges(me, { name: me.name, phone: "0".repeat(31) })).toEqual({
    error: "The phone number can be at most 30 characters.",
  });
});
