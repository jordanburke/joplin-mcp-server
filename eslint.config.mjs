import js from "@eslint/js"
import tsPlugin from "@typescript-eslint/eslint-plugin"
import tsParser from "@typescript-eslint/parser"
import prettierPlugin from "eslint-plugin-prettier"
import prettierConfig from "eslint-config-prettier"

export default [
  js.configs.recommended,
  {
    files: ["**/*.ts"],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: 2022,
        sourceType: "module",
        project: "./tsconfig.json",
      },
      globals: {
        console: "readonly",
        process: "readonly",
        setTimeout: "readonly",
        setInterval: "readonly",
        clearInterval: "readonly",
        Buffer: "readonly",
      },
    },
    plugins: {
      "@typescript-eslint": tsPlugin,
      prettier: prettierPlugin,
    },
    rules: {
      ...tsPlugin.configs["recommended"].rules,
      ...prettierConfig.rules,
      "prettier/prettier": "error",
      // TEMPORARY: Relaxed rules for existing codebase - address these systematically:

      // TODO: Replace 'any' types with proper TypeScript types
      // - Most usage in API responses, error handling, and test mocks
      // - Start with JoplinAPIClient generic types and tool parameter interfaces
      "@typescript-eslint/no-explicit-any": "warn",

      // TODO: Add proper type assertions and validation for API responses
      // - JoplinAPIClient methods need typed response interfaces
      // - Tool classes need stronger parameter typing
      "@typescript-eslint/no-unsafe-assignment": "off",

      // TODO: Type API calls and external library usage
      // - axios calls need typed response interfaces
      // - MCP SDK calls need proper typing
      "@typescript-eslint/no-unsafe-call": "off",

      // TODO: Add type guards for object property access
      // - API response property access needs validation
      // - Error object property access needs type guards
      "@typescript-eslint/no-unsafe-member-access": "off",

      // TODO: Type function return values properly
      // - API client methods need typed returns
      // - Tool methods already return string but internals need typing
      "@typescript-eslint/no-unsafe-return": "off",

      // TODO: Type function arguments in API calls
      // - Axios request bodies need interfaces
      // - Tool method parameters need stricter typing
      "@typescript-eslint/no-unsafe-argument": "off",

      // TODO: Add type guards for template literal expressions
      // - Error message formatting with unknown error types
      // - Dynamic string building with untyped variables
      "@typescript-eslint/restrict-template-expressions": "off",

      // TODO: Review async functions that don't actually await
      // - Some utility functions may not need to be async
      // - Consider Promise<void> vs void return types
      "@typescript-eslint/require-await": "off",

      // TODO: Add proper promise handling
      // - Manual test files have unhandled promises (main function calls)
      // - Consider using void operator or proper error handling
      "@typescript-eslint/no-floating-promises": "warn",

      // TODO: Replace empty interfaces with type aliases or add members
      // - Some tool parameter interfaces are empty (extend base types instead)
      // - Consider using type aliases for simple cases
      "@typescript-eslint/no-empty-object-type": "warn",

      // TODO: Add null checks instead of using non-null assertion
      // - Environment variable access (!process.env.VAR)
      // - Replace with proper validation and error handling
      "@typescript-eslint/no-non-null-assertion": "off",
      // Allow unused vars with underscore prefix, including in catch blocks
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
        },
      ],
    },
  },
  {
    files: ["**/__tests__/**/*.ts", "**/*.test.ts", "tests/**/*.ts"],
    rules: {
      "@typescript-eslint/unbound-method": "off",
    },
  },
  {
    ignores: ["node_modules/", "dist/", "*.js", "*.mjs", "*.cjs", "tsup.config.ts", "vitest.config.ts"],
  },
]
