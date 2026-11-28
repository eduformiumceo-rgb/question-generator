// Static checks for the whole app. Run with:  npm run lint
// Catches undefined names, broken hook rules, dead code and swallowed error causes BEFORE they reach users.
import js from "@eslint/js";
import globals from "globals";
import react from "eslint-plugin-react";
import hooks from "eslint-plugin-react-hooks";

export default [
  { ignores: ["dist/**", "node_modules/**", "_backup/**", ".wrangler/**", "src/jhs/**", "src/shs/**", "src/primary/**", "src/kg/**"] },  // curriculum data files
  js.configs.recommended,
  {
    files: ["**/*.{js,jsx,mjs}"],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: "module",
      globals: { ...globals.browser, ...globals.node, ...globals.serviceworker },
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    plugins: { react, "react-hooks": hooks },
    settings: { react: { version: "detect" } },
    rules: {
      "react/jsx-uses-vars": "error",
      "react/jsx-uses-react": "error",          // files here import React explicitly; JSX counts as using it
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",
      "no-unused-vars": ["warn", { args: "none", varsIgnorePattern: "^_", caughtErrors: "none", ignoreRestSiblings: true }],
      // deliberate patterns in this codebase:
      "no-empty": ["error", { allowEmptyCatch: true }],   // best-effort storage / parse calls
      "no-useless-escape": "off",                          // regex-heavy text and math parsing
      "no-control-regex": "off",                           // stripping control characters from pasted text on purpose
    },
  },
  { files: ["tests/**", "e2e/**"], languageOptions: { globals: { ...globals.vitest } } },
];
