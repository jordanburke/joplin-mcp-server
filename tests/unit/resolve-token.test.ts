import { Option } from "functype"
import { describe, expect, it } from "vitest"
import { externalTokenMissing, resolveTokenSource } from "../../src/lib/resolve-token.js"

const input = (o: { externalMode: boolean; explicit?: string; ambient?: string }) => ({
  externalMode: o.externalMode,
  explicitToken: Option(o.explicit),
  ambientToken: Option(o.ambient),
})

describe("resolveTokenSource", () => {
  describe("sidecar mode", () => {
    it("uses the profile token when nothing is supplied", () => {
      const r = resolveTokenSource(input({ externalMode: false }))
      expect(r.source).toBe("profile")
      expect(r.ambientIgnored).toBe(false)
    })

    // The core of the design: an inherited JOPLIN_TOKEN belongs to a different
    // Joplin and must not override the sidecar's own profile token.
    it("ignores an ambient JOPLIN_TOKEN and flags it", () => {
      const r = resolveTokenSource(input({ externalMode: false, ambient: "desktop-token" }))
      expect(r.source).toBe("profile")
      expect(r.ambientIgnored).toBe(true)
    })

    it("honors an explicit --token over the profile", () => {
      const r = resolveTokenSource(input({ externalMode: false, explicit: "chosen" }))
      expect(r.source).toBe("explicit")
      expect(r.ambientIgnored).toBe(false)
    })

    it("prefers an explicit --token even when an ambient token is present", () => {
      const r = resolveTokenSource(input({ externalMode: false, explicit: "chosen", ambient: "inherited" }))
      expect(r.source).toBe("explicit")
      expect(r.ambientIgnored).toBe(false)
    })
  })

  describe("external mode", () => {
    it("uses the ambient JOPLIN_TOKEN as the guest credential", () => {
      const r = resolveTokenSource(input({ externalMode: true, ambient: "guest" }))
      expect(r.source).toBe("external-env")
      expect(r.ambientIgnored).toBe(false)
    })

    it("prefers an explicit --token over the ambient one", () => {
      const r = resolveTokenSource(input({ externalMode: true, explicit: "chosen", ambient: "guest" }))
      expect(r.source).toBe("explicit")
    })

    it("falls back to a generated token when none is supplied", () => {
      const r = resolveTokenSource(input({ externalMode: true }))
      expect(r.source).toBe("external-generated")
    })
  })
})

describe("externalTokenMissing", () => {
  it("is true only in external mode with no token from any source", () => {
    expect(externalTokenMissing(input({ externalMode: true }))).toBe(true)
  })

  it("is false in external mode when a token is present", () => {
    expect(externalTokenMissing(input({ externalMode: true, ambient: "guest" }))).toBe(false)
    expect(externalTokenMissing(input({ externalMode: true, explicit: "chosen" }))).toBe(false)
  })

  // Sidecar mode always has a fallback (the profile token), so it is never missing.
  it("is false in sidecar mode regardless of tokens", () => {
    expect(externalTokenMissing(input({ externalMode: false }))).toBe(false)
  })
})
