import { describe, expect, it } from "vitest";
import { overviewCols } from "./overview";

describe("overviewCols", () => {
  it("nunca más de 3 por fila y 4 grupos van de a 2", () => {
    expect([1, 2, 3, 4, 5, 9].map(overviewCols)).toEqual([1, 2, 3, 2, 3, 3]);
  });
});
