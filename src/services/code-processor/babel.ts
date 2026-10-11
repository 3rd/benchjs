import * as babel from "@babel/standalone";
import type { PluginItem } from "@babel/core";
import { format } from "@/services/code-processor/prettier";

export const transform = async (code: string, filename?: string, plugins: PluginItem[] = []) => {
  const result = babel.transform(code, {
    filename: filename || "main.tsx",
    babelrc: false,
    plugins: [
      //
      ...plugins,
    ],
    presets: ["typescript"],
    generatorOpts: {
      comments: false,
      retainFunctionParens: true,
      retainLines: true,
    },
    sourceType: "module",
    configFile: false,
    ast: true,
  });

  const transformedCode = result?.code;
  if (transformedCode == null) {
    throw new Error("Failed to transform code");
  }

  return format(transformedCode.trim());
};
