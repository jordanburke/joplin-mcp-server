import { type ChildProcess, exec, execSync, spawn } from "child_process"
import crypto from "crypto"
import fs from "fs"
import { Either, Left, Match, Option, Right } from "functype"
import os from "os"
import { join } from "path"
import { promisify } from "util"

import { writeJoplinSettings } from "./joplin-settings.js"

const execAsync = promisify(exec)

const isWindows = process.platform === "win32"
const whichCmd = isWindows ? "where" : "which"

export type SyncTarget =
  | { type: "none" }
  | { type: "filesystem"; path: string }
  | { type: "joplin-cloud"; email: string; password: string }
  | { type: "joplin-server"; url: string; email: string; password: string }
  | { type: "webdav"; url: string; username: string; password: string }
  | { type: "nextcloud"; url: string; username: string; password: string }
  | { type: "s3"; bucket: string; region: string; accessKey: string; secretKey: string }
  | { type: "dropbox" }
  | { type: "onedrive" }

export type SidecarConfig = {
  profileDir: string
  apiPort: number
  apiToken: string
  syncTarget?: SyncTarget
  syncInterval?: number
}

export type SidecarError = {
  code: "CLI_NOT_FOUND" | "CONFIG_FAILED" | "SPAWN_FAILED" | "HEALTH_CHECK_FAILED" | "STOP_FAILED" | "SYNC_FAILED"
  message: string
  cause?: unknown
}

const sidecarError = (code: SidecarError["code"], message: string, cause?: unknown): SidecarError => ({
  code,
  message,
  cause,
})

const syncTargetId = (target: SyncTarget): number =>
  Match(target.type)
    .case("none", () => 0)
    .case("filesystem", () => 2)
    .case("webdav", () => 6)
    .case("nextcloud", () => 5)
    .case("dropbox", () => 7)
    .case("onedrive", () => 3)
    .case("s3", () => 8)
    .case("joplin-server", () => 9)
    .case("joplin-cloud", () => 10)
    .default(() => 0)

const findJoplinCli = async (): Promise<Either<SidecarError, string>> => {
  // 1. User override via env var
  const envCli = process.env.JOPLIN_CLI
  if (envCli) {
    if (fs.existsSync(envCli)) return Right(envCli)
    return Left(sidecarError("CLI_NOT_FOUND", `JOPLIN_CLI path not found: ${envCli}`))
  }

  // 2. Bundled in node_modules (if joplin is a dependency)
  const localBin = join(process.cwd(), "node_modules", ".bin", isWindows ? "joplin.cmd" : "joplin")
  if (fs.existsSync(localBin)) return Right(localBin)

  // 3. Global install
  try {
    const { stdout } = await execAsync(`${whichCmd} joplin`, { encoding: "utf-8", timeout: 10_000 })
    const joplinPath = stdout.trim().split("\n")[0]
    return Right(joplinPath)
  } catch {
    // not found
  }

  // 4. npx fallback (auto-downloads on first run)
  try {
    const { stdout } = await execAsync(`${whichCmd} npx`, { encoding: "utf-8", timeout: 10_000 })
    const npxPath = stdout.trim().split("\n")[0]
    process.stderr.write("[joplin-sidecar] No local joplin found, using npx (may download on first run)\n")
    return Right(npxPath)
  } catch {
    // not found
  }

  return Left(
    sidecarError(
      "CLI_NOT_FOUND",
      "Joplin CLI not found. Install with: npm install -g joplin, or set JOPLIN_CLI=/path/to/joplin",
    ),
  )
}

const buildSettingsRecord = (config: SidecarConfig): Record<string, string> => {
  const settings: Record<string, string> = {
    "api.token": config.apiToken,
    "api.port": String(config.apiPort),
  }

  const syncTarget = Option(config.syncTarget).orElse({ type: "none" } as SyncTarget)
  settings["sync.target"] = String(syncTargetId(syncTarget))

  if (syncTarget.type === "filesystem") {
    settings["sync.2.path"] = syncTarget.path
  } else if (syncTarget.type === "webdav") {
    settings["sync.6.path"] = syncTarget.url
    settings["sync.6.username"] = syncTarget.username
    settings["sync.6.password"] = syncTarget.password
  } else if (syncTarget.type === "nextcloud") {
    settings["sync.5.path"] = syncTarget.url
    settings["sync.5.username"] = syncTarget.username
    settings["sync.5.password"] = syncTarget.password
  } else if (syncTarget.type === "s3") {
    settings["sync.8.path"] = syncTarget.bucket
    settings["sync.8.region"] = syncTarget.region
    settings["sync.8.username"] = syncTarget.accessKey
    settings["sync.8.password"] = syncTarget.secretKey
  } else if (syncTarget.type === "joplin-server") {
    settings["sync.9.path"] = syncTarget.url
    settings["sync.9.username"] = syncTarget.email
    settings["sync.9.password"] = syncTarget.password
  } else if (syncTarget.type === "joplin-cloud") {
    settings["sync.10.username"] = syncTarget.email
    settings["sync.10.password"] = syncTarget.password
  }

  const interval = Option(config.syncInterval).orElse(300)
  settings["sync.interval"] = String(interval)

  return settings
}

const spawnServer = (cli: string, config: SidecarConfig): Either<SidecarError, ChildProcess> => {
  try {
    const cmd = cli.endsWith("npx") ? "npx" : cli
    const args = cli.endsWith("npx")
      ? ["joplin", "server", "start", "--profile", config.profileDir]
      : ["server", "start", "--profile", config.profileDir]

    const proc = spawn(cmd, args, {
      stdio: ["ignore", "pipe", "pipe"],
      detached: false,
      shell: isWindows,
    })

    proc.stderr?.on("data", (data: Buffer) => {
      process.stderr.write(`[joplin-sidecar] ${data.toString()}`)
    })

    proc.stdout?.on("data", (data: Buffer) => {
      process.stderr.write(`[joplin-sidecar] ${data.toString()}`)
    })

    proc.on("error", (err) => {
      process.stderr.write(`[joplin-sidecar] Process error: ${err.message}\n`)
    })

    return Right(proc as ChildProcess)
  } catch (e) {
    return Left(sidecarError("SPAWN_FAILED", "Failed to spawn Joplin server process", e))
  }
}

const waitForReady = async (
  port: number,
  maxRetries: number = 30,
  intervalMs: number = 1000,
): Promise<Either<SidecarError, true>> => {
  for (let i = 0; i < maxRetries; i++) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/ping`)
      if (response.ok) {
        process.stderr.write(`[joplin-sidecar] Server ready on port ${port}\n`)
        return Right(true as const)
      }
    } catch {
      // Not ready yet
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs))
  }

  return Left(
    sidecarError("HEALTH_CHECK_FAILED", `Joplin server did not become ready within ${maxRetries * intervalMs}ms`),
  )
}

const CONFIG_CACHE_FILE = ".mcp-configured"

const computeConfigHash = (config: SidecarConfig): string => {
  const hashData = {
    apiPort: config.apiPort,
    apiToken: config.apiToken,
    syncTarget: config.syncTarget,
    syncInterval: config.syncInterval,
  }
  return crypto.createHash("sha256").update(JSON.stringify(hashData)).digest("hex").slice(0, 16)
}

const isConfigCached = (profileDir: string, hash: string): boolean => {
  try {
    const cachePath = join(profileDir, CONFIG_CACHE_FILE)
    if (!fs.existsSync(cachePath)) return false
    const cached = JSON.parse(fs.readFileSync(cachePath, "utf-8"))
    return cached.hash === hash
  } catch {
    return false
  }
}

const writeConfigCache = (profileDir: string, hash: string): void => {
  try {
    const cachePath = join(profileDir, CONFIG_CACHE_FILE)
    fs.writeFileSync(cachePath, JSON.stringify({ hash, timestamp: Date.now() }))
  } catch {
    // Non-critical — skip silently
  }
}

export class JoplinSidecar {
  private config: SidecarConfig
  private childProcess: ChildProcess | null = null
  private startPromise: Promise<Either<SidecarError, ChildProcess>> | null = null

  constructor(config: Partial<SidecarConfig> & { apiToken: string }) {
    this.config = {
      profileDir: config.profileDir ?? join(os.homedir(), ".config", "joplin-mcp"),
      apiPort: config.apiPort ?? 41184,
      apiToken: config.apiToken,
      syncTarget: config.syncTarget,
      syncInterval: config.syncInterval,
    }
  }

  async start(): Promise<Either<SidecarError, ChildProcess>> {
    if (this.startPromise) return this.startPromise
    this.startPromise = this.doStart()
    return this.startPromise
  }

  private async doStart(): Promise<Either<SidecarError, ChildProcess>> {
    // Step 1: Find CLI
    const cliResult = await findJoplinCli()
    if (Either.isLeft(cliResult)) {
      return Left(
        cliResult.fold(
          (e) => e,
          () => null as never,
        ),
      )
    }
    const cli = cliResult.fold(
      () => "",
      (v) => v,
    )
    process.stderr.write(`[joplin-sidecar] Found CLI: ${cli}\n`)

    // Step 2: Configure via direct SQLite write (skip if config is cached)
    const configHash = computeConfigHash(this.config)
    if (isConfigCached(this.config.profileDir, configHash)) {
      process.stderr.write("[joplin-sidecar] Configuration cached, skipping config step\n")
    } else {
      const settings = buildSettingsRecord(this.config)
      const configResult = writeJoplinSettings(this.config.profileDir, settings)
      if (Either.isLeft(configResult)) {
        return Left(
          configResult.fold(
            (e) => e,
            () => null as never,
          ),
        )
      }
      writeConfigCache(this.config.profileDir, configHash)
      process.stderr.write("[joplin-sidecar] Configuration applied (direct SQLite write)\n")
    }

    // Step 3: Spawn server (skip if already spawned from a previous attempt)
    if (!this.childProcess) {
      const spawnResult = spawnServer(cli, this.config)
      if (Either.isLeft(spawnResult)) {
        return Left(
          spawnResult.fold(
            (e) => e,
            () => null as never,
          ),
        )
      }
      const proc = spawnResult.fold(
        () => null as unknown as ChildProcess,
        (v) => v,
      )
      this.childProcess = proc
      process.stderr.write(`[joplin-sidecar] Server spawned (pid: ${proc.pid})\n`)
    } else {
      process.stderr.write(
        `[joplin-sidecar] Server already spawned (pid: ${this.childProcess.pid}), waiting for ready\n`,
      )
    }

    // Step 4: Wait for ready
    const readyResult = await waitForReady(this.config.apiPort)
    if (Either.isLeft(readyResult)) {
      return Left(
        readyResult.fold(
          (e) => e,
          () => null as never,
        ),
      )
    }

    return Right(this.childProcess!)
  }

  async stop(): Promise<Either<Error, true>> {
    // Reset startPromise to allow retry via start() after stop()
    this.startPromise = null

    if (!this.childProcess) return Right(true as const)

    const proc = this.childProcess
    try {
      proc.kill("SIGTERM")

      await new Promise<void>((resolve) => {
        const timeout = setTimeout(() => {
          proc.kill("SIGKILL")
          resolve()
        }, 5000)

        proc.on("exit", () => {
          clearTimeout(timeout)
          resolve()
        })
      })

      this.childProcess = null
      process.stderr.write("[joplin-sidecar] Server stopped\n")
      return Right(true as const)
    } catch (error) {
      return Left(error instanceof Error ? error : new Error(String(error)))
    }
  }

  async healthCheck(): Promise<Either<Error, true>> {
    try {
      const response = await fetch(`http://127.0.0.1:${this.config.apiPort}/ping`)
      if (!response.ok) return Left(new Error(`Health check failed: ${response.status}`))
      return Right(true as const)
    } catch (error) {
      return Left(error instanceof Error ? error : new Error(String(error)))
    }
  }

  async sync(): Promise<Either<Error, string>> {
    try {
      let cmd: string
      try {
        cmd = execSync(`${whichCmd} joplin`, { encoding: "utf-8" }).trim().split("\n")[0]
      } catch {
        cmd = "npx joplin"
      }
      const output = execSync(`${cmd} sync --profile ${this.config.profileDir}`, {
        encoding: "utf-8",
        timeout: 120_000,
      })
      return Right(output)
    } catch (error) {
      return Left(error instanceof Error ? error : new Error(String(error)))
    }
  }

  getPort(): number {
    return this.config.apiPort
  }

  getHost(): string {
    return "127.0.0.1"
  }
}
