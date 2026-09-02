import { format } from "@/services/code-processor/prettier";
import { transform } from "./babel";

describe("babel", () => {
  it("should transform typescript code", async () => {
    const code = `
      // comments will be removed
      export const run = () => {
        return "hello world";
      }
    `;

    const result = await transform(code);
    expect(result).toBe(
      await format(`
      export const run = () => {
        return "hello world";
      };
    `),
    );
  });

  it("should execute custom plugins", async () => {
    const code = `
      type Sample = string;
      export const run = () => {
        return "hello world";
      }
    `;

    const result = await transform(code, "main.ts", [
      () => ({
        name: "custom-plugin",
        visitor: {
          TSTypeAliasDeclaration: {
            enter(path) {
              path.remove();
            },
          },
        },
      }),
    ]);
    expect(result).toBe(
      await format(`
      export const run = () => {
        return "hello world";
      };
    `),
    );
  });
});
