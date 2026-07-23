import fs from "fs"
import os from "os"
import { join } from "path"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { isProcessAlive, readProfileServerPid, servesOurProfile } from "../../src/lib/joplin-sidecar.js"

// A PID far above any realistic allocation, used to represent a dead process.
const DEAD_PID = 4_194_303

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
})
