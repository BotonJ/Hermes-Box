import js from "@eslint/js";
import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";
import reactPerf from "eslint-plugin-react-perf";
import jsxA11y from "eslint-plugin-jsx-a11y";

export default tseslint.config(
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["src/**/*.{ts,tsx}"],
    languageOptions: {
      parserOptions: {
        jsxPragma: "h",
        jsxFragmentName: "Fragment",
        ecmaFeatures: { jsx: true },
      },
      globals: {
        JSX: "readonly",
      },
    },
    plugins: {
      "react-hooks": reactHooks,
      "react-perf": reactPerf,
      "jsx-a11y": jsxA11y,
    },
    rules: {
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",
      "react-perf/jsx-no-new-array-as-prop": "warn",
      "react-perf/jsx-no-new-function-as-prop": "warn",
      "react-perf/jsx-no-new-object-as-prop": "warn",
      "no-unused-vars": "off",
      "@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_" }],
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/explicit-function-return-type": "off",
      "no-console": "off",
    },
    settings: {
      react: {
        pragma: "h",
        fragment: "Fragment",
      },
    },
  },
  {
    ignores: ["node_modules/", "src-tauri/", "dist/", "**/__mocks__/**"],
  }
);
