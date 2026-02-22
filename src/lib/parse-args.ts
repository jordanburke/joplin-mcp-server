import fs from "fs"
import { Either, Left, Option, Right } from "functype"
import os from "os"
import { join, resolve } from "path"

import type { SyncTarget } from "./joplin-sidecar.js"

export type ParsedArgs = {
  remainingArgs: string[]
  transport: "stdio" | "http"
  httpPort: number
  profileDir: string
  syncTarget: Option<SyncTarget>
}

const expandVars = (p: string): string =>
  p
    .replace(/\$\{(\w+)\}/g, (_, name) => process.env[name] ?? "")
    .replace(/\$(\w+)/g, (_, name) => process.env[name] ?? "")

const isWsl = (() => {
  try {
    return fs.readFileSync("/proc/version", "utf-8").toLowerCase().includes("microsoft")
  } catch {
    return false
  }
})()

const isNonEmptyDir = (p: string): boolean => {
  try {
    const entries = fs.readdirSync(p)
    return entries.length > 0
  } catch {
    return false
  }
}

const resolveWslPath = (linuxPath: string, relativeToHome: string): string => {
  if (!isWsl) return linuxPath
  if (fs.existsSync(linuxPath) && isNonEmptyDir(linuxPath)) return linuxPath
  try {
    const usersDir = "/mnt/c/Users"
    const users = fs
      .readdirSync(usersDir)
      .filter((u) => !["Public", "Default", "Default User", "All Users"].includes(u))
    for (const user of users) {
      const winPath = join(usersDir, user, relativeToHome)
      if (isNonEmptyDir(winPath)) {
        process.stderr.write(`[wsl] Path ${linuxPath} empty/missing, using Windows path: ${winPath}\n`)
        return winPath
      }
    }
  } catch {
    // /mnt/c not accessible — fall through
  }
  return linuxPath
}

const expandPath = (p: string): string => {
  const expanded = expandVars(p)
  if (expanded.startsWith("~/") || expanded === "~") {
    const linuxPath = expanded.replace("~", os.homedir())
    const relativeToHome = expanded.slice(2) // strip ~/
    return resolveWslPath(linuxPath, relativeToHome)
  }
  return expanded
}

const extractArg = (args: string[], flag: string): Option<string> => {
  const index = args.indexOf(flag)
  if (index === -1) return Option.none()
  const value = args[index + 1]
  if (!value || value.startsWith("--")) return Option.none()
  args.splice(index, 2)
  return Option(value)
}

export const buildSyncTarget = (args: {
  syncTarget: Option<string>
  syncPath: Option<string>
  syncUsername: Option<string>
  syncPassword: Option<string>
}): Either<string, SyncTarget> => {
  const targetType = args.syncTarget.orElse("none")

  switch (targetType) {
    case "none":
      return Right({ type: "none" } as SyncTarget)

    case "filesystem":
      return args.syncPath.fold(
        () => Left("--sync-path required for filesystem sync target"),
        (path) => Right({ type: "filesystem", path } as SyncTarget),
      )

    case "webdav":
      return args.syncPath.fold(
        () => Left("--sync-path required for webdav sync target"),
        (url) =>
          args.syncUsername.fold(
            () => Left("--sync-username required for webdav sync target"),
            (username) =>
              args.syncPassword.fold(
                () => Left("--sync-password required for webdav sync target"),
                (password) => Right({ type: "webdav", url, username, password } as SyncTarget),
              ),
          ),
      )

    case "nextcloud":
      return args.syncPath.fold(
        () => Left("--sync-path required for nextcloud sync target"),
        (url) =>
          args.syncUsername.fold(
            () => Left("--sync-username required for nextcloud sync target"),
            (username) =>
              args.syncPassword.fold(
                () => Left("--sync-password required for nextcloud sync target"),
                (password) => Right({ type: "nextcloud", url, username, password } as SyncTarget),
              ),
          ),
      )

    case "joplin-cloud":
      return args.syncUsername.fold(
        () => Left("--sync-username required for joplin-cloud sync target"),
        (email) =>
          args.syncPassword.fold(
            () => Left("--sync-password required for joplin-cloud sync target"),
            (password) => Right({ type: "joplin-cloud", email, password } as SyncTarget),
          ),
      )

    case "joplin-server":
      return args.syncPath.fold(
        () => Left("--sync-path required for joplin-server sync target"),
        (url) =>
          args.syncUsername.fold(
            () => Left("--sync-username required for joplin-server sync target"),
            (email) =>
              args.syncPassword.fold(
                () => Left("--sync-password required for joplin-server sync target"),
                (password) => Right({ type: "joplin-server", url, email, password } as SyncTarget),
              ),
          ),
      )

    case "s3":
      return args.syncPath.fold(
        () => Left("--sync-path (bucket) required for s3 sync target"),
        (bucket) =>
          args.syncUsername.fold(
            () => Left("--sync-username (access key) required for s3 sync target"),
            (accessKey) =>
              args.syncPassword.fold(
                () => Left("--sync-password (secret key) required for s3 sync target"),
                (secretKey) => Right({ type: "s3", bucket, region: "us-east-1", accessKey, secretKey } as SyncTarget),
              ),
          ),
      )

    case "dropbox":
      return Right({ type: "dropbox" } as SyncTarget)

    case "onedrive":
      return Right({ type: "onedrive" } as SyncTarget)

    default:
      return Left(
        `Unknown sync target: ${targetType}. Valid targets: none, filesystem, webdav, nextcloud, joplin-cloud, joplin-server, s3, dropbox, onedrive`,
      )
  }
}

function parseArgs(): ParsedArgs {
  const args = process.argv.slice(2)
  let transport: "stdio" | "http" = "stdio"
  let httpPort = 3000

  // Load environment variables without dotenv debug output (for MCP stdio compatibility)
  const loadEnvFile = (envPath: string) => {
    try {
      if (fs.existsSync(envPath)) {
        process.stderr.write(`Loading environment from: ${envPath}\n`)
        const envContent = fs.readFileSync(envPath, "utf-8")
        const envLines = envContent.split("\n")
        const loadedVars: string[] = []

        for (const line of envLines) {
          const trimmedLine = line.trim()
          if (trimmedLine && !trimmedLine.startsWith("#")) {
            const [key, ...valueParts] = trimmedLine.split("=")
            if (key && valueParts.length > 0) {
              const value = valueParts.join("=").replace(/^["']|["']$/g, "")
              if (!process.env[key.trim()]) {
                process.env[key.trim()] = value
                loadedVars.push(key.trim())
              }
            }
          }
        }

        if (loadedVars.length > 0) {
          process.stderr.write(`Loaded variables: ${loadedVars.join(", ")}\n`)
        }
      }
    } catch (error: unknown) {
      process.stderr.write(`Error loading environment file: ${error}\n`)
    }
  }

  // Handle --env-file
  const envFile = extractArg(args, "--env-file")
  envFile.fold(
    () => loadEnvFile(".env"),
    (file) => loadEnvFile(resolve(process.cwd(), file)),
  )

  // Handle --token
  extractArg(args, "--token").fold(
    () => {},
    (token) => {
      process.env.JOPLIN_TOKEN = token
    },
  )

  // Handle --transport
  extractArg(args, "--transport").fold(
    () => {},
    (value) => {
      if (value !== "stdio" && value !== "http") {
        process.stderr.write("Error: --transport must be either 'stdio' or 'http'\n")
        process.exit(1)
      }
      transport = value as "stdio" | "http"
    },
  )

  // Handle --http-port
  extractArg(args, "--http-port").fold(
    () => {},
    (value) => {
      const parsed = parseInt(value, 10)
      if (isNaN(parsed) || parsed < 1 || parsed > 65535) {
        process.stderr.write("Error: --http-port must be a valid port number (1-65535)\n")
        process.exit(1)
      }
      httpPort = parsed
    },
  )

  // Handle --profile
  const profileDir = extractArg(args, "--profile")
    .or(Option(process.env.JOPLIN_PROFILE))
    .map(expandPath)
    .orElse(`${os.homedir()}/.config/joplin-mcp`)

  // Handle sync args
  const syncTarget = extractArg(args, "--sync-target").or(Option(process.env.JOPLIN_SYNC_TARGET))
  const syncPath = extractArg(args, "--sync-path").or(Option(process.env.JOPLIN_SYNC_PATH)).map(expandPath)
  const syncUsername = extractArg(args, "--sync-username").or(Option(process.env.JOPLIN_SYNC_USERNAME))
  const syncPassword = extractArg(args, "--sync-password").or(Option(process.env.JOPLIN_SYNC_PASSWORD))

  // Build and validate sync target
  const syncResult = buildSyncTarget({ syncTarget, syncPath, syncUsername, syncPassword })
  if (Either.isLeft(syncResult)) {
    const err = syncResult.fold(
      (e) => e,
      () => "",
    )
    process.stderr.write(`Error: ${err}\n`)
    process.exit(1)
  }
  const syncTargetValue = syncResult.fold(
    () => ({ type: "none" }) as SyncTarget,
    (v) => v,
  )
  const resolvedSyncTarget: Option<SyncTarget> =
    syncTargetValue.type === "none" ? Option.none<SyncTarget>() : Option(syncTargetValue as SyncTarget)

  // Handle --help
  if (args.includes("--help") || args.includes("-h")) {
    process.stderr.write(`
Joplin MCP Server (Sidecar Mode)

USAGE:
  joplin-mcp-server [OPTIONS]

OPTIONS:
  --env-file <file>          Load environment variables from file
  --token <token>            Joplin API token
  --transport <type>         Transport type: stdio (default) or http
  --http-port <port>         HTTP server port (default: 3000, only with --transport http)
  --profile <dir>            Joplin data directory (default: ~/.config/joplin-mcp)
  --sync-target <type>       Sync target: none, filesystem, webdav, nextcloud,
                             joplin-cloud, joplin-server, s3, dropbox, onedrive
  --sync-path <url>          URL or path for sync target
  --sync-username <user>     Username/email for sync
  --sync-password <pass>     Password for sync
  --help, -h                 Show this help message

ENVIRONMENT VARIABLES:
  JOPLIN_TOKEN               Joplin API token (required)
  JOPLIN_HOST                Connect to existing Joplin at this host (skips sidecar)
  JOPLIN_PORT                Connect to existing Joplin on this port (skips sidecar)
  JOPLIN_CLI                 Path to joplin CLI binary (overrides auto-detection)
  JOPLIN_PROFILE             Joplin data directory
  JOPLIN_SYNC_TARGET         Sync target type
  JOPLIN_SYNC_PATH           Sync target URL/path
  JOPLIN_SYNC_USERNAME       Sync username/email
  JOPLIN_SYNC_PASSWORD       Sync password
  LOG_LEVEL                  Log level: debug, info, warn, error (default: info)

MODES:
  Sidecar (default):
    Spawns and manages its own Joplin Terminal process.
    No Joplin desktop app or Web Clipper needed.
    Uses an isolated profile at --profile path (default: ~/.config/joplin-mcp).

  External (JOPLIN_HOST/JOPLIN_PORT set):
    Connects directly to an existing Joplin instance.
    Useful for WSL connecting to Windows Joplin desktop.

EXAMPLES:
  # Minimal - local notes, no sync
  joplin-mcp-server --token my_token

  # Joplin Cloud sync
  joplin-mcp-server --token my_token \\
    --sync-target joplin-cloud \\
    --sync-username user@example.com --sync-password pass

  # WebDAV sync
  joplin-mcp-server --token my_token \\
    --sync-target webdav \\
    --sync-path https://dav.example.com/joplin \\
    --sync-username user --sync-password pass

  # Filesystem sync (Syncthing, NAS)
  joplin-mcp-server --token my_token \\
    --sync-target filesystem --sync-path /mnt/sync/joplin

  # HTTP transport for web apps
  joplin-mcp-server --token my_token --transport http --http-port 3000

  # External mode - connect to existing Joplin (e.g. Windows desktop from WSL)
  JOPLIN_HOST=172.x.x.x JOPLIN_PORT=41184 joplin-mcp-server --token my_token

Find your Joplin token in: Tools > Options > Web Clipper
`)
    process.exit(0)
  }

  return {
    remainingArgs: args,
    transport,
    httpPort,
    profileDir,
    syncTarget: resolvedSyncTarget,
  }
}

export default parseArgs
