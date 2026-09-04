import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Combobox } from "./combobox";

const renderCombobox = (hasSearched: boolean) =>
  renderToStaticMarkup(
    <Combobox
      value="missing-package"
      options={[]}
      hasSearched={hasSearched}
      onChange={() => {}}
      onSelect={() => {}}
    />,
  );

describe("Combobox", () => {
  it("keeps an empty-result status region mounted before announcing the result", () => {
    const idleOutput = renderCombobox(false);
    const emptyOutput = renderCombobox(true);

    expect(idleOutput).toContain('role="status"');
    expect(idleOutput).not.toContain("No packages found");
    expect(emptyOutput).toContain('role="status"');
    expect(emptyOutput).toContain("No packages found");
  });
});
