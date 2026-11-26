import baseConfig from "ts-builds/eslint-functype"

export default [
  ...baseConfig,
  {
    // Source files - relax any rules temporarily during migration
    files: ["src/**/*.ts"],
    rules: {
      "@typescript-eslint/no-explicit-any": "warn",
      // ts-builds 5 raised these functype style rules to errors. The tools predate them, so they stay
      // warnings until the tools are rewritten in the functype style, which is a change of its own.
      "functype/no-array-mutation": "warn",
      "functype/prefer-either": "warn",
      "functype/prefer-list": "warn",
      "functype/prefer-option": "warn",
      "functype/prefer-try": "warn",
    },
  },
  {
    // Test files - allow any types for mocking
    files: ["**/__tests__/**/*.{ts,tsx}", "**/*.test.{ts,tsx}", "**/*.spec.{ts,tsx}"],
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-unsafe-assignment": "off",
      "@typescript-eslint/no-unsafe-member-access": "off",
      "@typescript-eslint/no-unsafe-argument": "off",
      "@typescript-eslint/no-unsafe-return": "off",
      "@typescript-eslint/no-unsafe-call": "off",
    },
  },
]
