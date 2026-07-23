import { type ChildProcess, exec, execFile, spawn } from "child_process"
import crypto from "crypto"
import fs from "fs"
import { Either, Left, Match, Option, Right } from "functype"
import { Platform } from "functype-os"
import { join } from "path"
import { promisify } from "util"

const execAsync = promisify(exec)
const execFileAsync = promisify(execFile)

const isWindows = Platform.isWindows()
const whichCmd = isWindows ? "where" : "which"

export const DEFAULT_API_PORT = 41184
const MAX_PORT_ATTEMPTS = 10

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
  code:
    | "CLI_NOT_FOUND"
    | "CONFIG_FAILED"
    | "SPAWN_FAILED"
    | "HEALTH_CHECK_FAILED"
    | "STOP_FAILED"
    | "SYNC_FAILED"
    | "PORT_CONFLICT"
    | "PORT_OCCUPIED"
    | "PORT_EXHAUSTED"
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

const fetchWithTimeout = async (url: string, timeoutMs: number = 5_000): Promise<Response> => {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    return await fetch(url, { signal: controller.signal })
  } finally {
    clearTimeout(timer)
  }
}

type PortProbeResult =
  "free" | "joplin_ours" | "joplin_foreign" | "joplin_unowned" | "occupied_other" | "occupied_unresponsive"

const CLIPPER_PID_FILE = "clipper-pid.txt"

const readProfileServerPid = (profileDir: string): Option<number> => {
  try {
    const raw = fs.readFileSync(join(profileDir, CLIPPER_PID_FILE), "utf-8").trim()
    const pid = Number.parseInt(raw, 10)
    return Number.isInteger(pid) && pid > 0 ? Option(pid) : Option.none()
  } catch {
    return Option.none()
  }
}

const isProcessAlive = (pid: number): boolean => {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

// A Joplin server records its PID inside the profile directory it serves. If our
// profile has no live PID recorded, then whatever is answering on the port belongs
// to some other profile — reusing it would silently serve the wrong database.
const servesOurProfile = (profileDir: string): boolean =>
  readProfileServerPid(profileDir).fold(
    () => false,
    (pid) => isProcessAlive(pid),
  )

const isConnectionRefused = (err: unknown): boolean => {
  const e = err as { cause?: { code?: string; errors?: Array<{ code?: string }> } }
  if (e.cause?.code === "ECONNREFUSED") return true
  if (e.cause?.errors?.some((inner) => inner.code === "ECONNREFUSED") === true) return true
  return false
}

const probePort = async (port: number, token: string, profileDir: string): Promise<PortProbeResult> => {
  try {
    const pingResponse = await fetchWithTimeout(`http://127.0.0.1:${port}/ping`, 3_000)
    const body = await pingResponse.text()
    if (body !== "JoplinClipperServer") return "occupied_other"

    // It's a Joplin server — check if the token matches
    try {
      const authResponse = await fetchWithTimeout(
        `http://127.0.0.1:${port}/folders?token=${encodeURIComponent(token)}&limit=1`,
        3_000,
      )
      // Accepting our token is not enough: an orphan serving a different profile
      // answers identically but exposes the wrong (often empty) database.
      if (authResponse.ok) return servesOurProfile(profileDir) ? "joplin_ours" : "joplin_unowned"
      return "joplin_foreign"
    } catch {
      return "joplin_foreign"
    }
  } catch (err: unknown) {
    // ECONNREFUSED = nothing listening on the port = genuinely free
    if (isConnectionRefused(err)) return "free"
    // Timeout or other error = port is occupied but not responding to HTTP
    return "occupied_unresponsive"
  }
}

type PortResolution =
  | { outcome: "reuse_existing"; port: number; desktopDetected: boolean }
  | { outcome: "free"; port: number; desktopDetected: boolean }
  | { outcome: "exhausted" }

const resolveAvailablePort = async (startPort: number, token: string, profileDir: string): Promise<PortResolution> => {
  const tryPort = async (port: number, desktopDetected: boolean): Promise<PortResolution> => {
    if (port >= startPort + MAX_PORT_ATTEMPTS) return { outcome: "exhausted" }
    const status = await probePort(port, token, profileDir)
    if (status === "free") return { outcome: "free", port, desktopDetected }
    if (status === "joplin_ours") return { outcome: "reuse_existing", port, desktopDetected }
    if (status === "joplin_unowned") {
      process.stderr.write(
        `[joplin-sidecar] Port ${port}: Joplin server accepts our token but serves a different profile ` +
          `(likely an orphan from a previous run), skipping\n`,
      )
      return tryPort(port + 1, desktopDetected)
    }
    if (status === "joplin_foreign") {
      process.stderr.write(
        `[joplin-sidecar] Port ${port}: another Joplin instance with a different token ` +
          `(possibly Joplin Desktop), skipping\n`,
      )
      return tryPort(port + 1, true)
    }
    process.stderr.write(`[joplin-sidecar] Port ${port} occupied (${status}), trying next...\n`)
    return tryPort(port + 1, desktopDetected)
  }
  return tryPort(startPort, false)
}

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

const runJoplinConfig = async (cli: string, profileDir: string, key: string, value: string): Promise<void> => {
  const cmd = cli.endsWith("npx") ? "npx" : cli
  // --profile is a global flag: it must precede the subcommand or the CLI
  // silently ignores it and falls back to the default ~/.config/joplin profile.
  const args = cli.endsWith("npx")
    ? ["joplin", "--profile", profileDir, "config", key, value]
    : ["--profile", profileDir, "config", key, value]
  await execFileAsync(cmd, args, { encoding: "utf-8", timeout: 30_000, shell: isWindows })
}

const configureJoplin = async (cli: string, config: SidecarConfig): Promise<Either<SidecarError, void>> => {
  const settings = buildSettingsRecord(config)
  try {
    fs.mkdirSync(config.profileDir, { recursive: true })
    for (const [key, value] of Object.entries(settings)) {
      await runJoplinConfig(cli, config.profileDir, key, value)
    }
    return Right(undefined as void)
  } catch (e) {
    return Left(sidecarError("CONFIG_FAILED", "Failed to configure Joplin via CLI", e))
  }
}

const spawnServer = (cli: string, config: SidecarConfig): Either<SidecarError, ChildProcess> => {
  try {
    const cmd = cli.endsWith("npx") ? "npx" : cli
    // --profile must precede the subcommand (see runJoplinConfig).
    const args = cli.endsWith("npx")
      ? ["joplin", "--profile", config.profileDir, "server", "start"]
      : ["--profile", config.profileDir, "server", "start"]

    const proc = spawn(cmd, args, {
      stdio: ["ignore", "pipe", "pipe"],
      detached: false,
      shell: isWindows,
    })

    proc.stderr.on("data", (data: Buffer) => {
      process.stderr.write(`[joplin-sidecar] ${data.toString()}`)
    })

    proc.stdout.on("data", (data: Buffer) => {
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
  token: string,
  proc: ChildProcess | null,
  maxRetries: number = 30,
  intervalMs: number = 1000,
): Promise<Either<SidecarError, true>> => {
  const deadline = Date.now() + 60_000

  // Track if the spawned process exits early (e.g., port already taken).
  // Mutable object container keeps the binding `const` while allowing the
  // exit handler to record the code asynchronously.
  const procExitState: { code: number | null } = { code: null }
  if (proc) {
    proc.once("exit", (code) => {
      procExitState.code = code
    })
  }

  const attempt = async (i: number): Promise<Either<SidecarError, true>> => {
    if (i >= maxRetries || Date.now() > deadline) {
      return Left(sidecarError("HEALTH_CHECK_FAILED", "Joplin server did not become ready within 60s"))
    }

    if (procExitState.code !== null) {
      return Left(
        sidecarError(
          "SPAWN_FAILED",
          `Joplin server process exited unexpectedly (code ${procExitState.code}). ` +
            `Port ${port} may already be in use by another Joplin instance or process.`,
        ),
      )
    }

    try {
      const pingResponse = await fetchWithTimeout(`http://127.0.0.1:${port}/ping`)
      if (pingResponse.ok) {
        try {
          const authResponse = await fetchWithTimeout(
            `http://127.0.0.1:${port}/folders?token=${encodeURIComponent(token)}&limit=1`,
          )
          if (authResponse.ok) {
            process.stderr.write(`[joplin-sidecar] Server ready on port ${port}\n`)
            return Right(true as const)
          }
          process.stderr.write(
            `[joplin-sidecar] Ping OK but auth failed (status ${authResponse.status}), retrying...\n`,
          )
        } catch {
          process.stderr.write("[joplin-sidecar] Ping OK but auth check timed out, retrying...\n")
        }
      }
    } catch {
      // Not ready yet
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs))
    return attempt(i + 1)
  }

  return attempt(0)
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

export { isProcessAlive, readProfileServerPid, servesOurProfile }

export class JoplinSidecar {
  private config: SidecarConfig
  private childProcess: ChildProcess | null = null
  private startPromise: Promise<Either<SidecarError, ChildProcess>> | null = null
  private portResolution: PortResolution | null = null
  private cleanupRegistered = false

  constructor(config: Partial<SidecarConfig> & { apiToken: string }) {
    this.config = {
      profileDir: config.profileDir ?? join(Platform.homeDir(), ".config", "joplin-mcp"),
      apiPort: config.apiPort ?? DEFAULT_API_PORT,
      apiToken: config.apiToken,
      syncTarget: config.syncTarget,
      syncInterval: config.syncInterval,
    }
  }

  // Best-effort synchronous teardown. Only sync work is possible from an "exit"
  // handler, and we reap the profile's recorded PID as well as our own child so
  // that a server we lost the handle to does not survive as an orphan.
  private killChildSync(): void {
    // Only reap what we spawned. A server we merely reused may be shared with
    // another MCP process, so tearing it down here is not ours to do.
    if (!this.childProcess) return
    try {
      this.childProcess.kill("SIGTERM")
    } catch {
      // already gone
    }
    this.reapRecordedServer()
  }

  // Under the npx launcher our direct child is only a wrapper — the real Joplin
  // server is a grandchild that outlives it. Reap it via the PID it recorded in
  // the profile, which is how orphans accumulated across sessions.
  private reapRecordedServer(): void {
    readProfileServerPid(this.config.profileDir).fold(
      () => undefined,
      (pid) => {
        if (pid !== process.pid && isProcessAlive(pid)) {
          try {
            process.kill(pid, "SIGTERM")
          } catch {
            // already gone
          }
        }
        return undefined
      },
    )
  }

  // SIGINT/SIGTERM are handled by the entrypoint; these cover the exit paths it
  // misses. A SIGKILLed parent runs no handler at all, which is why start-up
  // refuses to reuse a server that is not serving our profile.
  private registerCleanup(): void {
    if (this.cleanupRegistered) return
    this.cleanupRegistered = true
    process.once("exit", () => this.killChildSync())
    process.once("SIGHUP", () => {
      this.killChildSync()
      process.exit(0)
    })
  }

  async resolvePort(): Promise<Either<SidecarError, number>> {
    const resolution = await resolveAvailablePort(this.config.apiPort, this.config.apiToken, this.config.profileDir)
    this.portResolution = resolution
    if (resolution.outcome === "exhausted") {
      const lastPort = this.config.apiPort + MAX_PORT_ATTEMPTS - 1
      return Left(
        sidecarError(
          "PORT_EXHAUSTED",
          `All ports ${this.config.apiPort}-${lastPort} are occupied. Free a port or stop other Joplin instances.`,
        ),
      )
    }
    this.config.apiPort = resolution.port
    if (resolution.desktopDetected) {
      process.stderr.write(
        "[joplin-sidecar] WARNING: Joplin Desktop is running. The sidecar uses a separate database.\n" +
          "[joplin-sidecar] Notes will sync between them only if both are configured with the same sync target.\n",
      )
    }
    return Right(resolution.port)
  }

  isDesktopDetected(): boolean {
    return this.portResolution?.outcome !== "exhausted" && (this.portResolution?.desktopDetected ?? false)
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

    // Step 2: Resolve port if not already done (defensive fallback)
    if (!this.portResolution) {
      const portResult = await this.resolvePort()
      if (Either.isLeft(portResult)) {
        return Left(
          portResult.fold(
            (e) => e,
            () => null as never,
          ),
        )
      }
    }

    // Step 3: If we found an existing instance with our token, reuse it
    if (this.portResolution?.outcome === "reuse_existing") {
      process.stderr.write(
        `[joplin-sidecar] Existing Joplin server with matching token on port ${this.config.apiPort}, reusing\n`,
      )
      return Right(this.childProcess ?? (null as unknown as ChildProcess))
    }

    // Step 4: Configure via CLI (skip if config is cached)
    const configHash = computeConfigHash(this.config)
    if (isConfigCached(this.config.profileDir, configHash)) {
      process.stderr.write("[joplin-sidecar] Configuration cached, skipping config step\n")
    } else {
      const configResult = await configureJoplin(cli, this.config)
      if (Either.isLeft(configResult)) {
        return Left(
          configResult.fold(
            (e) => e,
            () => null as never,
          ),
        )
      }
      writeConfigCache(this.config.profileDir, configHash)
      process.stderr.write("[joplin-sidecar] Configuration applied via CLI\n")
    }

    // Step 5: Spawn server (port is free, skip if already spawned from a previous attempt)
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
      this.registerCleanup()
      process.stderr.write(`[joplin-sidecar] Server spawned (pid: ${proc.pid})\n`)
    } else {
      process.stderr.write(
        `[joplin-sidecar] Server already spawned (pid: ${this.childProcess.pid}), waiting for ready\n`,
      )
    }

    // Step 6: Wait for ready
    const readyResult = await waitForReady(this.config.apiPort, this.config.apiToken, this.childProcess)
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

      this.reapRecordedServer()
      this.childProcess = null
      process.stderr.write("[joplin-sidecar] Server stopped\n")
      return Right(true as const)
    } catch (error) {
      return Left(error instanceof Error ? error : new Error(String(error)))
    }
  }

  async healthCheck(): Promise<Either<Error, true>> {
    try {
      const response = await fetchWithTimeout(`http://127.0.0.1:${this.config.apiPort}/ping`, 5_000)
      if (!response.ok) return Left(new Error(`Health check failed: ${response.status}`))
      return Right(true as const)
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
