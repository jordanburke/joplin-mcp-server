import fs from "fs"
import os from "os"
import { join } from "path"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import type { SidecarConfig } from "../../src/lib/joplin-sidecar.js"
import {
  computeIdentityHash,
  inspectRunningSidecar,
  isProcessAlive,
  localCliCandidates,
  readProfileServerPid,
  summarizeSyncOutput,
  readSidecarStamp,
  servesOurProfile,
  writeSidecarStamp,
} from "../../src/lib/joplin-sidecar.js"

// A PID far above any realistic allocation, used to represent a dead process.
const DEAD_PID = 4_194_303

const CLI_BIN_NAME = process.platform === "win32" ? "joplin.cmd" : "joplin"

describe("sidecar profile ownership", () => {
  let profileDir: string

  beforeEach(() => {
    profileDir = fs.mkdtempSync(join(os.tmpdir(), "joplin-mcp-test-"))
  })

  afterEach(() => {
    fs.rmSync(profileDir, { recursive: true, force: true })
  })

  const writePid = (contents: string): void => fs.writeFileSync(join(profileDir, "clipper-pid.txt"), contents)

  describe("readProfileServerPid", () => {
    it("returns none when the profile has no recorded pid", () => {
      expect(readProfileServerPid(profileDir).isEmpty).toBe(true)
    })

    it("returns none for a non-numeric pid file", () => {
      writePid("not-a-pid")
      expect(readProfileServerPid(profileDir).isEmpty).toBe(true)
    })

    it("returns none for a non-positive pid", () => {
      writePid("0")
      expect(readProfileServerPid(profileDir).isEmpty).toBe(true)
    })

    it("reads a valid pid, ignoring surrounding whitespace", () => {
      writePid(" 12345\n")
      const pid = readProfileServerPid(profileDir).fold(
        () => null,
        (v) => v,
      )
      expect(pid).toBe(12345)
    })
  })

  describe("isProcessAlive", () => {
    it("detects the current process as alive", () => {
      expect(isProcessAlive(process.pid)).toBe(true)
    })

    it("reports an unallocated pid as not alive", () => {
      expect(isProcessAlive(DEAD_PID)).toBe(false)
    })
  })

  describe("servesOurProfile", () => {
    it("is false when no server pid was ever recorded", () => {
      expect(servesOurProfile(profileDir)).toBe(false)
    })

    // The orphan case: a server answering our token while serving a different
    // profile leaves no live pid in ours, so it must not be reused.
    it("is false when the recorded server is no longer running", () => {
      writePid(String(DEAD_PID))
      expect(servesOurProfile(profileDir)).toBe(false)
    })

    it("is true when the recorded server is still running", () => {
      writePid(String(process.pid))
      expect(servesOurProfile(profileDir)).toBe(true)
    })
  })

  describe("computeIdentityHash", () => {
    const base: SidecarConfig = {
      profileDir: "/tmp/example",
      apiPort: 41184,
      apiToken: "mcp-token",
      syncTarget: { type: "filesystem", path: "/data/joplin" },
      syncInterval: 300,
      version: "2.1.1",
    }

    it("is stable for an unchanged configuration", () => {
      expect(computeIdentityHash(base)).toBe(computeIdentityHash({ ...base }))
    })

    // The upgrade path: a new release must not adopt the previous release's server.
    it("changes when the version changes", () => {
      expect(computeIdentityHash({ ...base, version: "2.2.0" })).not.toBe(computeIdentityHash(base))
    })

    it("changes when the sync target changes", () => {
      const moved: SidecarConfig = { ...base, syncTarget: { type: "filesystem", path: "/data/elsewhere" } }
      expect(computeIdentityHash(moved)).not.toBe(computeIdentityHash(base))
    })

    // The token is intentionally NOT part of identity: reuse is gated by an auth
    // probe first, so a server with a different token never reaches the identity
    // comparison. Keeping it out also avoids writing token-derived data to disk.
    it("ignores the token", () => {
      expect(computeIdentityHash({ ...base, apiToken: "mcp-other" })).toBe(computeIdentityHash(base))
    })

    // The port is resolved dynamically and says nothing about what the server serves,
    // so it must not fragment identity between otherwise-identical processes.
    it("ignores the api port", () => {
      expect(computeIdentityHash({ ...base, apiPort: 41190 })).toBe(computeIdentityHash(base))
    })
  })

  describe("readSidecarStamp", () => {
    it("returns none when nothing has been stamped", () => {
      expect(readSidecarStamp(profileDir).isEmpty).toBe(true)
    })

    it("returns none for a malformed stamp", () => {
      fs.writeFileSync(join(profileDir, ".mcp-sidecar.json"), '{"version":2}')
      expect(readSidecarStamp(profileDir).isEmpty).toBe(true)
    })

    it("round-trips a written stamp", () => {
      writeSidecarStamp(profileDir, { version: "2.1.1", identity: "abc123" })
      const stamp = readSidecarStamp(profileDir).fold(
        () => null,
        (v) => v,
      )
      expect(stamp).toEqual({ version: "2.1.1", identity: "abc123" })
    })
  })

  describe("inspectRunningSidecar", () => {
    it("reports not-ours when no live server holds the profile", () => {
      writePid(String(DEAD_PID))
      writeSidecarStamp(profileDir, { version: "2.1.1", identity: "abc123" })
      expect(inspectRunningSidecar(profileDir, "abc123")).toBe("not-ours")
    })

    // Servers predating stamping cannot be vouched for, so they get replaced.
    it("reports stale when a live server left no stamp", () => {
      writePid(String(process.pid))
      expect(inspectRunningSidecar(profileDir, "abc123")).toBe("stale")
    })

    it("reports stale when the running server has a different identity", () => {
      writePid(String(process.pid))
      writeSidecarStamp(profileDir, { version: "2.0.0", identity: "old-identity" })
      expect(inspectRunningSidecar(profileDir, "abc123")).toBe("stale")
    })

    it("reports reusable when identity matches a live server", () => {
      writePid(String(process.pid))
      writeSidecarStamp(profileDir, { version: "2.1.1", identity: "abc123" })
      expect(inspectRunningSidecar(profileDir, "abc123")).toBe("reusable")
    })
  })

  describe("localCliCandidates", () => {
    it("looks for the CLI in node_modules/.bin", () => {
      const suffix = join("node_modules", ".bin")
      expect(localCliCandidates().every((p) => p.includes(suffix))).toBe(true)
    })

    // The packaged-install failure: the host application sets the working
    // directory, so a cwd-relative lookup finds nothing and the sidecar silently
    // falls back to downloading the CLI through npx.
    it("finds the bundled CLI when the working directory is elsewhere", () => {
      const original = process.cwd()
      try {
        process.chdir(os.tmpdir())
        const found = localCliCandidates().filter((p) => fs.existsSync(p))
        expect(found.length).toBeGreaterThan(0)
      } finally {
        process.chdir(original)
      }
    })

    it("still searches the working directory for local development", () => {
      expect(localCliCandidates()).toContain(join(process.cwd(), "node_modules", ".bin", CLI_BIN_NAME))
    })
  })

  describe("summarizeSyncOutput", () => {
    it("picks the final item-count line from real joplin output", () => {
      const out = [
        "Synchronisation target:  (2)",
        "Starting synchronisation...",
        "Fetched items: 1/50.",
        "Downloading resources...",
        "Created local items: 813. Fetched items: 813/813. Completed: 23/07/2026 22:06 (3s)",
      ].join("\n")
      expect(summarizeSyncOutput(out)).toContain("Created local items: 813")
    })

    it("prefers a Completed line when present", () => {
      const out = "Starting synchronisation...\nCompleted: 23/07/2026 22:06 (0s)"
      expect(summarizeSyncOutput(out)).toContain("Completed")
    })

    it("falls back to the last non-empty line when no count line exists", () => {
      expect(summarizeSyncOutput("Starting synchronisation...\nNothing to sync\n\n")).toBe("Nothing to sync")
    })

    it("returns a default for empty output", () => {
      expect(summarizeSyncOutput("   \n  \n")).toBe("Sync completed.")
    })
  })
})
