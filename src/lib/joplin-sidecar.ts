import { type ChildProcess, execSync, spawn } from "child_process"
import fs from "fs"
import { Either, Left, Match, Option, Right } from "functype"
import { dirname, join } from "path"
import { fileURLToPath } from "url"

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

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

const findJoplinCli = (): Either<SidecarError, string> => {
  // 1. User override via env var
  const envCli = process.env.JOPLIN_CLI
  if (envCli) {
    if (fs.existsSync(envCli)) return Right(envCli)
    return Left(sidecarError("CLI_NOT_FOUND", `JOPLIN_CLI path not found: ${envCli}`))
  }

  // 2. Bundled in node_modules (if joplin is a dependency)
  const localBin = join(process.cwd(), "node_modules", ".bin", "joplin")
  if (fs.existsSync(localBin)) return Right(localBin)

  // 3. Global install
  try {
    const joplinPath = execSync("which joplin", { encoding: "utf-8" }).trim()
    return Right(joplinPath)
  } catch {
    // not found
  }

  // 4. npx fallback (auto-downloads on first run)
  try {
    const npxPath = execSync("which npx", { encoding: "utf-8" }).trim()
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

const runJoplinConfig = (cmd: string, profileDir: string, key: string, value: string): Either<SidecarError, void> => {
  try {
    execSync(`${cmd} config --profile ${profileDir} ${key} ${value}`, {
      encoding: "utf-8",
      timeout: 30_000,
    })
    return Right(undefined as void)
  } catch (e) {
    return Left(sidecarError("CONFIG_FAILED", `Failed to set ${key}`, e))
  }
}

const configureJoplin = (cli: string, config: SidecarConfig): Either<SidecarError, void> => {
  const cmd = cli.endsWith("npx") ? `${cli} joplin` : cli

  // Ensure profile directory exists
  try {
    execSync(`mkdir -p ${config.profileDir}`, { encoding: "utf-8" })
  } catch (e) {
    return Left(sidecarError("CONFIG_FAILED", "Failed to create profile directory", e))
  }

  // Set API token
  const tokenResult = runJoplinConfig(cmd, config.profileDir, "api.token", config.apiToken)
  if (Either.isLeft(tokenResult)) return tokenResult

  // Set API port
  const portResult = runJoplinConfig(cmd, config.profileDir, "api.port", String(config.apiPort))
  if (Either.isLeft(portResult)) return portResult

  // Configure sync target
  const syncTarget = Option(config.syncTarget).orElse({ type: "none" } as SyncTarget)
  const syncResult = runJoplinConfig(cmd, config.profileDir, "sync.target", String(syncTargetId(syncTarget)))
  if (Either.isLeft(syncResult)) return syncResult

  // Configure sync-target-specific settings
  const configResults: Either<SidecarError, void>[] = []

  if (syncTarget.type === "filesystem") {
    configResults.push(runJoplinConfig(cmd, config.profileDir, "sync.2.path", syncTarget.path))
  } else if (syncTarget.type === "webdav") {
    configResults.push(runJoplinConfig(cmd, config.profileDir, "sync.6.path", syncTarget.url))
    configResults.push(runJoplinConfig(cmd, config.profileDir, "sync.6.username", syncTarget.username))
    configResults.push(runJoplinConfig(cmd, config.profileDir, "sync.6.password", syncTarget.password))
  } else if (syncTarget.type === "nextcloud") {
    configResults.push(runJoplinConfig(cmd, config.profileDir, "sync.5.path", syncTarget.url))
    configResults.push(runJoplinConfig(cmd, config.profileDir, "sync.5.username", syncTarget.username))
    configResults.push(runJoplinConfig(cmd, config.profileDir, "sync.5.password", syncTarget.password))
  } else if (syncTarget.type === "s3") {
    configResults.push(runJoplinConfig(cmd, config.profileDir, "sync.8.path", syncTarget.bucket))
    configResults.push(runJoplinConfig(cmd, config.profileDir, "sync.8.region", syncTarget.region))
    configResults.push(runJoplinConfig(cmd, config.profileDir, "sync.8.username", syncTarget.accessKey))
    configResults.push(runJoplinConfig(cmd, config.profileDir, "sync.8.password", syncTarget.secretKey))
  } else if (syncTarget.type === "joplin-server") {
    configResults.push(runJoplinConfig(cmd, config.profileDir, "sync.9.path", syncTarget.url))
    configResults.push(runJoplinConfig(cmd, config.profileDir, "sync.9.username", syncTarget.email))
    configResults.push(runJoplinConfig(cmd, config.profileDir, "sync.9.password", syncTarget.password))
  } else if (syncTarget.type === "joplin-cloud") {
    configResults.push(runJoplinConfig(cmd, config.profileDir, "sync.10.username", syncTarget.email))
    configResults.push(runJoplinConfig(cmd, config.profileDir, "sync.10.password", syncTarget.password))
  }

  const failed = configResults.find((r) => Either.isLeft(r))
  if (failed) return failed

  // Set sync interval
  const interval = Option(config.syncInterval).orElse(300)
  return runJoplinConfig(cmd, config.profileDir, "sync.interval", String(interval))
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

export class JoplinSidecar {
  private config: SidecarConfig
  private childProcess: ChildProcess | null = null

  constructor(config: Partial<SidecarConfig> & { apiToken: string }) {
    this.config = {
      profileDir: config.profileDir ?? `${process.env.HOME}/.config/joplin-mcp`,
      apiPort: config.apiPort ?? 41184,
      apiToken: config.apiToken,
      syncTarget: config.syncTarget,
      syncInterval: config.syncInterval,
    }
  }

  async start(): Promise<Either<SidecarError, ChildProcess>> {
    // Step 1: Find CLI
    const cliResult = findJoplinCli()
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

    // Step 2: Configure
    const configResult = configureJoplin(cli, this.config)
    if (Either.isLeft(configResult)) {
      return Left(
        configResult.fold(
          (e) => e,
          () => null as never,
        ),
      )
    }
    process.stderr.write("[joplin-sidecar] Configuration applied\n")

    // Step 3: Spawn server
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

    return Right(proc)
  }

  async stop(): Promise<Either<Error, true>> {
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
      const cli = execSync("which joplin", { encoding: "utf-8" }).trim()
      const cmd = cli || "npx joplin"
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
