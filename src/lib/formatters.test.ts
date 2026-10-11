import { formatCountShort } from "./formatters";

describe("formatCountShort", () => {
  it("rounds averaged throughput below 1,000 to whole operations", () => {
    expect(formatCountShort(412.6)).toBe("413");
  });

  it("rounds values below 10 to at most two decimals without trailing zeros", () => {
    expect(formatCountShort(0)).toBe("0");
    expect(formatCountShort(3.14159)).toBe("3.14");
  });

  it("abbreviates thousands and millions", () => {
    expect(formatCountShort(550_000)).toBe("550.0k");
    expect(formatCountShort(3_461_250)).toBe("3.5M");
  });
});
