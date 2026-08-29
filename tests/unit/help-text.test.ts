import { describe, expect, it } from "vitest"

import { helpText } from "../../src/lib/help-text.js"

describe("helpText", () => {
  it("includes the version when one is supplied", () => {
    expect(helpText("9.9.9")).toContain("Joplin MCP Server v9.9.9")
  })

  it("omits the version line when none is supplied", () => {
    expect(helpText()).toContain("Joplin MCP Server (Sidecar Mode)")
    expect(helpText()).not.toContain("v undefined")
  })

  // src/bin.ts and src/lib/parse-args.ts print this same text. They used to
  // carry separate copies, and the CLI one silently omitted every sync flag.
  it.each([
    "--sync-target",
    "--sync-path",
    "--sync-username",
    "--sync-password",
    "--sync-region",
    "--sync-endpoint",
    "--sync-force-path-style",
    "--profile",
    "--transport",
  ])("documents %s", (flag) => {
    expect(helpText()).toContain(flag)
  })

  it.each(["JOPLIN_SYNC_REGION", "JOPLIN_SYNC_ENDPOINT", "JOPLIN_SYNC_FORCE_PATH_STYLE"])(
    "documents the %s environment variable",
    (envVar) => {
      expect(helpText()).toContain(envVar)
    },
  )

  it("shows a non-AWS S3 example", () => {
    expect(helpText()).toContain("backblazeb2.com")
  })
})
