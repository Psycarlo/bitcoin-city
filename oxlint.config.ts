import { defineConfig } from "oxlint";
import core from "ultracite/oxlint/core";
import react from "ultracite/oxlint/react";

export default defineConfig({
  extends: [core, react],
  // shadcn/ui components are generated vendor code (`shadcn add`), keep them
  // pristine so future regenerations diff cleanly.
  ignorePatterns: [...core.ignorePatterns, "src/components/ui/**"],
  plugins: ["react", "typescript", "oxc"],
  rules: {
    "react/only-export-components": ["warn", { allowConstantExport: true }],
    "react/rules-of-hooks": "error",
  },
});
