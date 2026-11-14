import { describe, expect, it } from "vitest";
import { formatElapsed, formatNumber } from "./format";

describe("formato", () => {
  it("usa coma decimal y punto de miles", () => {
    expect(formatNumber(1234.56, 1)).toBe("1.234,6");
  });

  it("muestra el tiempo de misión con días solo cuando hacen falta", () => {
    expect(formatElapsed(3725)).toBe("01:02:05");
    expect(formatElapsed(90061)).toBe("01:01:01:01");
  });
});
