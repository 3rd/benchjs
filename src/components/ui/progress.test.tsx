import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Progress } from "./progress";

const renderProgress = (value?: number | null) => renderToStaticMarkup(<Progress value={value} />);

describe("Progress", () => {
  it.each([
    { value: 0, transform: "translateX(-100%)" },
    { value: 37, transform: "translateX(-63%)" },
    { value: 100, transform: "translateX(-0%)" },
  ])("keeps an accessible value of $value aligned with its visual transform", ({ value, transform }) => {
    const output = renderProgress(value);

    expect(output).toContain(`aria-valuenow="${value}"`);
    expect(output).toContain(`transform:${transform}`);
  });

  it("keeps an omitted value indeterminate", () => {
    const output = renderProgress();

    expect(output).not.toContain("aria-valuenow");
    expect(output).toContain("transform:translateX(-100%)");
  });
});
