import { afterEach, describe, expect, it, vi } from "vitest"

import parseArgs from "../../src/lib/parse-args.js"

describe("--http-host", () => {
  const argv = process.argv

  afterEach(() => {
    process.argv = argv
    vi.unstubAllEnvs()
  })

  it("defaults to localhost, so HTTP mode is not reachable from other machines unless asked", () => {
    vi.stubEnv("JOPLIN_MCP_HTTP_HOST", undefined)
    process.argv = ["node", "index.js", "--transport", "http"]
    expect(parseArgs().httpHost).toBe("localhost")
  })

  it("takes the flag over the environment", () => {
    vi.stubEnv("JOPLIN_MCP_HTTP_HOST", "127.0.0.1")
    process.argv = ["node", "index.js", "--transport", "http", "--http-host", "0.0.0.0"]
    expect(parseArgs().httpHost).toBe("0.0.0.0")
  })

  it("treats a blank flag or env value as unset, so it never binds every interface", () => {
    vi.stubEnv("JOPLIN_MCP_HTTP_HOST", "")
    process.argv = ["node", "index.js", "--transport", "http"]
    expect(parseArgs().httpHost).toBe("localhost")

    vi.stubEnv("JOPLIN_MCP_HTTP_HOST", "  ")
    process.argv = ["node", "index.js", "--transport", "http", "--http-host", ""]
    expect(parseArgs().httpHost).toBe("localhost")
  })

  it("falls back to JOPLIN_MCP_HTTP_HOST", () => {
    vi.stubEnv("JOPLIN_MCP_HTTP_HOST", "0.0.0.0")
    process.argv = ["node", "index.js", "--transport", "http"]
    expect(parseArgs().httpHost).toBe("0.0.0.0")
  })
})
