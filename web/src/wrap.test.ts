import { describe, expect, it } from "vitest";
import { wrapLines } from "./layout";

describe("wrapLines", () => {
  it("parte por palabras", () => {
    expect(wrapLines("uno dos", 7)).toBe(1);
    expect(wrapLines("uno dos tres", 7)).toBe(2);
  });
  it("corta las palabras que no entran solas", () => {
    expect(wrapLines("abcdefghij", 4)).toBe(3);
    expect(wrapLines("ab abcdefghij", 4)).toBe(4);
  });
});
