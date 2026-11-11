import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  { rules: { "react/no-unescaped-entities": "off" } },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    ".next-*/**", // compilations séparées (e2e, essais)
    "out/**",
    "build/**",
    "next-env.d.ts",
    "site breizh/**",
    "public/scratch-editor/**",
    "scratch-editor/node_modules/**",
  ]),
]);

export default eslintConfig;
