import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"
import { Option } from "functype"

// Hoisted mocks for functype-os and fs, populated per-test via mockImplementation.
const mockPlatform = vi.hoisted(() => ({
  isWSL: vi.fn(() => false),
  isWindows: vi.fn(() => false),
  windowsHomeDir: vi.fn(() => Option.none<string>()),
  homeDir: vi.fn(() => "/home/testuser"),
}))

const mockPath = vi.hoisted(() => ({
  expandTilde: vi.fn((p: string) => {
    if (p === "~") return "/home/testuser"
    if (p.startsWith("~/")) return `/home/testuser/${p.slice(2)}`
    return p
  }),
}))

const mockFs = vi.hoisted(() => ({
  existsSync: vi.fn(() => false),
  readdirSync: vi.fn(() => [] as string[]),
}))

vi.mock("functype-os", () => ({
  Platform: mockPlatform,
  Path: mockPath,
}))

vi.mock("fs", () => ({
  default: mockFs,
  ...mockFs,
}))

// Import AFTER mocks so the module picks them up.
const { expandPath, expandVars, resolveWslPath } = await import("../../src/lib/parse-args.js")

describe("parse-args path helpers", () => {
  const originalEnv = process.env

  beforeEach(() => {
    vi.clearAllMocks()
    process.env = { ...originalEnv }
    // Re-apply default behaviors after clearAllMocks wipes them
    mockPlatform.isWSL.mockReturnValue(false)
    mockPlatform.isWindows.mockReturnValue(false)
    mockPlatform.windowsHomeDir.mockReturnValue(Option.none<string>())
    mockPlatform.homeDir.mockReturnValue("/home/testuser")
    mockPath.expandTilde.mockImplementation((p: string) => {
      if (p === "~") return "/home/testuser"
      if (p.startsWith("~/")) return `/home/testuser/${p.slice(2)}`
      return p
    })
    mockFs.existsSync.mockReturnValue(false)
    mockFs.readdirSync.mockReturnValue([])
  })

  afterEach(() => {
    process.env = originalEnv
  })

  describe("expandVars", () => {
    it("expands ${VAR} syntax", () => {
      process.env.MY_VAR = "value"
      expect(expandVars("/path/${MY_VAR}/foo")).toBe("/path/value/foo")
    })

    it("expands $VAR syntax", () => {
      process.env.MY_VAR = "value"
      expect(expandVars("/path/$MY_VAR/foo")).toBe("/path/value/foo")
    })

    it("expands multiple vars in one path", () => {
      process.env.A = "first"
      process.env.B = "second"
      expect(expandVars("${A}/$B/end")).toBe("first/second/end")
    })

    it("substitutes empty string for missing vars (silently)", () => {
      delete process.env.MISSING
      expect(expandVars("/foo/${MISSING}/bar")).toBe("/foo//bar")
    })

    it("leaves a path with no variables unchanged", () => {
      expect(expandVars("/just/a/path")).toBe("/just/a/path")
    })
  })

  describe("expandPath", () => {
    it("expands ~ alone to the home directory", () => {
      expect(expandPath("~")).toBe("/home/testuser")
    })

    it("expands ~/foo to <home>/foo", () => {
      expect(expandPath("~/Documents/notes")).toBe("/home/testuser/Documents/notes")
    })

    it("expands env vars before tilde", () => {
      process.env.SUB = "Documents"
      expect(expandPath("~/${SUB}/notes")).toBe("/home/testuser/Documents/notes")
    })

    it("returns absolute paths unchanged", () => {
      expect(expandPath("/etc/joplin")).toBe("/etc/joplin")
    })

    it("returns relative paths unchanged (no leading tilde)", () => {
      expect(expandPath("./relative")).toBe("./relative")
    })

    it("does not touch tilde in the middle of a path", () => {
      expect(expandPath("/foo/~bar")).toBe("/foo/~bar")
    })
  })

  describe("resolveWslPath", () => {
    it("returns the linux path unchanged when not running on WSL", () => {
      mockPlatform.isWSL.mockReturnValue(false)
      expect(resolveWslPath("/home/jordan/OneDrive", "OneDrive")).toBe("/home/jordan/OneDrive")
      expect(mockPlatform.windowsHomeDir).not.toHaveBeenCalled()
    })

    it("returns the linux path when WSL and the linux path is a non-empty directory", () => {
      mockPlatform.isWSL.mockReturnValue(true)
      mockFs.existsSync.mockReturnValue(true)
      mockFs.readdirSync.mockReturnValue(["file1.txt"])

      expect(resolveWslPath("/home/jordan/OneDrive", "OneDrive")).toBe("/home/jordan/OneDrive")
      expect(mockPlatform.windowsHomeDir).not.toHaveBeenCalled()
    })

    it("falls back to Windows home when WSL and the linux path is empty/missing", () => {
      mockPlatform.isWSL.mockReturnValue(true)
      mockFs.existsSync.mockReturnValue(false)
      mockPlatform.windowsHomeDir.mockReturnValue(Option("/mnt/c/Users/jordan"))
      // Windows-side path: readdirSync returns non-empty
      mockFs.readdirSync.mockImplementation((p: string) => {
        if (p === "/mnt/c/Users/jordan/OneDrive") return ["doc.md"]
        return []
      })

      expect(resolveWslPath("/home/jordan/OneDrive", "OneDrive")).toBe("/mnt/c/Users/jordan/OneDrive")
      expect(mockPlatform.windowsHomeDir).toHaveBeenCalledOnce()
    })

    it("falls back to the linux path when WSL has no Windows home", () => {
      mockPlatform.isWSL.mockReturnValue(true)
      mockFs.existsSync.mockReturnValue(false)
      mockPlatform.windowsHomeDir.mockReturnValue(Option.none<string>())

      expect(resolveWslPath("/home/jordan/OneDrive", "OneDrive")).toBe("/home/jordan/OneDrive")
    })

    it("falls back to the linux path when the Windows-side path is also empty", () => {
      mockPlatform.isWSL.mockReturnValue(true)
      mockFs.existsSync.mockReturnValue(false)
      mockPlatform.windowsHomeDir.mockReturnValue(Option("/mnt/c/Users/jordan"))
      // Windows-side path is also empty
      mockFs.readdirSync.mockReturnValue([])

      expect(resolveWslPath("/home/jordan/OneDrive", "OneDrive")).toBe("/home/jordan/OneDrive")
    })
  })

  describe("expandPath + WSL integration", () => {
    it("routes ~/X to the Windows home when on WSL and the linux side is empty", () => {
      mockPlatform.isWSL.mockReturnValue(true)
      mockFs.existsSync.mockReturnValue(false)
      mockPlatform.windowsHomeDir.mockReturnValue(Option("/mnt/c/Users/jordan"))
      mockFs.readdirSync.mockImplementation((p: string) => {
        if (p === "/mnt/c/Users/jordan/OneDrive/Apps/Joplin") return ["doc.md"]
        return []
      })

      expect(expandPath("~/OneDrive/Apps/Joplin")).toBe("/mnt/c/Users/jordan/OneDrive/Apps/Joplin")
    })

    it("keeps the linux home expansion when off WSL", () => {
      mockPlatform.isWSL.mockReturnValue(false)
      expect(expandPath("~/OneDrive/Apps/Joplin")).toBe("/home/testuser/OneDrive/Apps/Joplin")
      expect(mockPlatform.windowsHomeDir).not.toHaveBeenCalled()
    })
  })
})
