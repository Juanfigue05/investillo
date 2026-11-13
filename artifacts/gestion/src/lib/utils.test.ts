import { describe, expect, it } from "vitest";
import { parseNumberCO } from "./utils";

describe("parseNumberCO para precios", () => {
  it("interpreta puntos decimales y comas decimales sin perder los centavos", () => {
    expect(parseNumberCO("40586.66")).toBe(40586.66);
    expect(parseNumberCO("40586,66")).toBe(40586.66);
    expect(parseNumberCO("40.586,66")).toBe(40586.66);
    expect(parseNumberCO("40,58")).toBe(40.58);
  });
});
