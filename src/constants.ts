export const README_FILE_ID = "README.md";
export const SETUP_FILE_ID = "setup.ts";
export const BUILT_IN_FILE_IDS: ReadonlySet<string> = new Set([README_FILE_ID, SETUP_FILE_ID]);

export const README_CONTENT = `# Quick Start Guide

## File Structure
- setup.ts: Setup code to prepare data, create helper functions, etc.
- implementations/*.{ts,js}: Implementation files containing benchmarkFn

## Writing Benchmarks

1. Setup (setup.ts):

Everything you export will be available as a global for each implementation.

\`\`\`typescript
// create and export test data
export const data = Array.from({ length: 1000 }, (_, i) => i);
export const sum = (arr: number[]) => arr.reduce((a, b) => a + b, 0);
\`\`\`

2. Implementations (example.ts):

Implementation-specific code goes here, and you need to export a function named 'run'.

\`\`\`typescript
export const run = () => {
  return data.reduce(sum, 0);
}
\`\`\`
`;

export const DEFAULT_SETUP_CODE = `
// This is your setup file, use it to prepare data and create shared helpers.
// Everything you export will be available as a global for each implementation.

// create and export test data
const generateTestData = (size: number) => {
  return Array.from({ length: size }, (_, i) => i);
};
export const data = generateTestData(1000);

// export a helper function
export const sum = (a: number, b: number) => a + b;
`.trim();

export const DEFAULT_SETUP_DTS = `
declare global {
  declare const data: number[];
  declare const sum: (a: number, b: number) => number;
}
export {};
`.trim();

export const DEFAULT_IMPLEMENTATION = `
// You have access to everything you exported in setup.ts
// All you need to do is export a function named "run"

export const run = () => {
  return data.reduce(sum, 0);
};
`.trim();
