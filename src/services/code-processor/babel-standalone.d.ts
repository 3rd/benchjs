// @babel/standalone@8 ships no type declarations; mirror the subset we use via @babel/core's types.
declare module "@babel/standalone" {
  import type { FileResult, InputOptions, types } from "@babel/core";

  export const packages: { types: typeof types };
  export const transform: (code: string, options?: InputOptions) => FileResult;
}
