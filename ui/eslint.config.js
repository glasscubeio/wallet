import { defineConfig, globalIgnores } from "eslint/config";
import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";

export default defineConfig(
  globalIgnores(["dist", "node_modules"]),
  {
    files: ["**/*.{ts,tsx}"],
    extends: [
      js.configs.recommended,
      // Type-aware rules: these are the ones that catch real bugs (floating
      // promises, unsafe narrowing) rather than style nits.
      ...tseslint.configs.recommendedTypeChecked,
      // `configs.flat.*` — the top-level `configs["recommended-latest"]` in
      // this plugin is still eslintrc-shaped and flat config rejects it.
      reactHooks.configs.flat["recommended-latest"],
    ],
    languageOptions: {
      ecmaVersion: 2022,
      globals: globals.browser,
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    plugins: {
      "react-refresh": reactRefresh,
    },
    rules: {
      // Vite's fast refresh only works when a module exports components alone.
      // A warning, not an error: the ui/ helpers next to a component are a
      // deliberate trade and we don't want that failing CI.
      "react-refresh/only-export-components": [
        "warn",
        { allowConstantExport: true },
      ],

      // `void somePromise()` is how we say "fire and forget, deliberately".
      "@typescript-eslint/no-floating-promises": "error",
      "@typescript-eslint/no-misused-promises": [
        "error",
        { checksVoidReturn: { attributes: false } },
      ],

      /*
        Off deliberately. This rule targets derived state — recomputing render
        values in an effect and setting them back, which does cause cascading
        renders. Every hit in this codebase is instead a mount-time data fetch
        (`void load()`), where the setState happens in a callback after the
        network resolves. That's the documented use for an effect when you
        aren't running a data-fetching library, and the rule can't distinguish
        the two. Revisit if we adopt one.
      */
      "react-hooks/set-state-in-effect": "off",

      // Leading underscore means "intentionally unused" — used when destructuring
      // a key out of an object to drop it.
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
          ignoreRestSiblings: true,
        },
      ],
    },
  },
);
