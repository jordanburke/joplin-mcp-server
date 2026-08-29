import fs from "fs"
import { Either, Left, Option, Right } from "functype"
import { Path, Platform } from "functype-os"
import { join, resolve } from "path"

import { helpText } from "./help-text.js"
import type { SyncTarget } from "./joplin-sidecar.js"

export type ParsedArgs = {
  remainingArgs: string[]
  transport: "stdio" | "http"
  httpPort: number
  profileDir: string
  syncTarget: Option<SyncTarget>
  // A token passed explicitly via --token. Kept distinct from an ambient
  // JOPLIN_TOKEN so sidecar mode can honor the deliberate flag while ignoring an
  // inherited environment variable that belongs to a different (external) Joplin.
  explicitToken: Option<string>
}

// Local expandVars preserves the existing "silently substitute empty for missing
// env vars" behavior — functype-os's Path.expandVars returns Left on unresolved
// variables, which would break paths like ~/${MAYBE_UNSET}/foo.
const expandVars = (p: string): string =>
  p
    .replace(/\$\{(\w+)\}/g, (_, name) => process.env[name] ?? "")
    .replace(/\$(\w+)/g, (_, name) => process.env[name] ?? "")

const isNonEmptyDir = (p: string): boolean => {
  try {
    const entries = fs.readdirSync(p)
    return entries.length > 0
  } catch {
    return false
  }
}

// On WSL, a path like ~/OneDrive may resolve to an empty Linux directory while
// the real data lives under the Windows user profile. Fall back to the WSL
// user's Windows home (resolved via cmd.exe %USERPROFILE%) when that happens.
const resolveWslPath = (linuxPath: string, relativeToHome: string): string => {
  if (!Platform.isWSL()) return linuxPath
  if (fs.existsSync(linuxPath) && isNonEmptyDir(linuxPath)) return linuxPath
  return Platform.windowsHomeDir()
    .map((winHome) => join(winHome, relativeToHome))
    .filter(isNonEmptyDir)
    .map((winPath) => {
      process.stderr.write(`[wsl] Path ${linuxPath} empty/missing, using Windows path: ${winPath}\n`)
      return winPath
    })
    .orElse(linuxPath)
}

const expandPath = (p: string): string => {
  const expanded = expandVars(p)
  const tildeExpanded = Path.expandTilde(expanded)
  if (expanded === "~" || expanded.startsWith("~/")) {
    const relativeToHome = expanded === "~" ? "" : expanded.slice(2)
    return resolveWslPath(tildeExpanded, relativeToHome)
  }
  return tildeExpanded
}

const extractArg = (args: string[], flag: string): Option<string> => {
  const index = args.indexOf(flag)
  if (index === -1) return Option.none()
  const value = args[index + 1]
  if (!value || value.startsWith("--")) return Option.none()
  args.splice(index, 2)
  return Option(value)
}

// Joplin's own S3 defaults, so an existing AWS setup keeps working when no
// endpoint or region is supplied.
const DEFAULT_S3_REGION = "us-east-1"
const DEFAULT_S3_ENDPOINT = "https://s3.amazonaws.com/"

const parseBooleanArg = (value: Option<string>, flag: string): Either<string, boolean> =>
  value.fold<Either<string, boolean>>(
    () => Right(false),
    (raw) => {
      const normalized = raw.trim().toLowerCase()
      if (normalized === "true" || normalized === "1") return Right(true)
      if (normalized === "false" || normalized === "0") return Right(false)
      return Left(`${flag} must be true or false (got: ${raw})`)
    },
  )

const isValidUrl = (value: string): boolean => {
  try {
    new URL(value)
    return true
  } catch {
    return false
  }
}

export const buildSyncTarget = (args: {
  syncTarget: Option<string>
  syncPath: Option<string>
  syncUsername: Option<string>
  syncPassword: Option<string>
  syncRegion: Option<string>
  syncEndpoint: Option<string>
  syncForcePathStyle: Option<string>
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

    case "s3": {
      const region = args.syncRegion.orElse(DEFAULT_S3_REGION)
      const url = args.syncEndpoint.orElse(DEFAULT_S3_ENDPOINT)

      if (!isValidUrl(url)) return Left(`--sync-endpoint must be a valid URL (got: ${url})`)

      return parseBooleanArg(args.syncForcePathStyle, "--sync-force-path-style").flatMap((forcePathStyle) =>
        args.syncPath.fold<Either<string, SyncTarget>>(
          () => Left("--sync-path (bucket) required for s3 sync target"),
          (bucket) =>
            args.syncUsername.fold<Either<string, SyncTarget>>(
              () => Left("--sync-username (access key) required for s3 sync target"),
              (accessKey) =>
                args.syncPassword.fold<Either<string, SyncTarget>>(
                  () => Left("--sync-password (secret key) required for s3 sync target"),
                  (secretKey) =>
                    Right({
                      type: "s3",
                      bucket,
                      region,
                      url,
                      forcePathStyle,
                      accessKey,
                      secretKey,
                    } as SyncTarget),
                ),
            ),
        ),
      )
    }

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

  // Handle --token. Surfaced as an explicit value rather than written into the
  // environment, so downstream can tell a deliberate flag from an inherited var.
  const explicitToken = extractArg(args, "--token")

  // Handle --transport
  const transport: "stdio" | "http" = extractArg(args, "--transport")
    .map((value): "stdio" | "http" => {
      if (value !== "stdio" && value !== "http") {
        process.stderr.write("Error: --transport must be either 'stdio' or 'http'\n")
        process.exit(1)
      }
      return value
    })
    .orElse("stdio")

  // Handle --http-port
  const httpPort: number = extractArg(args, "--http-port")
    .map((value) => {
      const parsed = parseInt(value, 10)
      if (isNaN(parsed) || parsed < 1 || parsed > 65535) {
        process.stderr.write("Error: --http-port must be a valid port number (1-65535)\n")
        process.exit(1)
      }
      return parsed
    })
    .orElse(3000)

  // Handle --profile
  const profileDir = extractArg(args, "--profile")
    .or(Option(process.env.JOPLIN_PROFILE))
    .map(expandPath)
    .orElse(expandPath("~/.config/joplin-mcp"))

  // Handle sync args. --sync-path stays unexpanded here: only the filesystem
  // target is a real path. Expanding a WebDAV URL or an S3 bucket name would
  // rewrite any $var it contains to the empty string.
  const syncTarget = extractArg(args, "--sync-target").or(Option(process.env.JOPLIN_SYNC_TARGET))
  const syncPath = extractArg(args, "--sync-path").or(Option(process.env.JOPLIN_SYNC_PATH))
  const syncUsername = extractArg(args, "--sync-username").or(Option(process.env.JOPLIN_SYNC_USERNAME))
  const syncPassword = extractArg(args, "--sync-password").or(Option(process.env.JOPLIN_SYNC_PASSWORD))
  const syncRegion = extractArg(args, "--sync-region").or(Option(process.env.JOPLIN_SYNC_REGION))
  const syncEndpoint = extractArg(args, "--sync-endpoint").or(Option(process.env.JOPLIN_SYNC_ENDPOINT))
  const syncForcePathStyle = extractArg(args, "--sync-force-path-style").or(
    Option(process.env.JOPLIN_SYNC_FORCE_PATH_STYLE),
  )

  // Build and validate sync target, then expand the one field that is a path.
  // expandPath touches the filesystem (WSL fallback), so it stays out of the
  // pure buildSyncTarget.
  const syncResult = buildSyncTarget({
    syncTarget,
    syncPath,
    syncUsername,
    syncPassword,
    syncRegion,
    syncEndpoint,
    syncForcePathStyle,
  }).map((target) =>
    target.type === "filesystem" ? ({ ...target, path: expandPath(target.path) } as SyncTarget) : target,
  )
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
    process.stderr.write(helpText())
    process.exit(0)
  }

  return {
    remainingArgs: args,
    transport,
    httpPort,
    profileDir,
    syncTarget: resolvedSyncTarget,
    explicitToken,
  }
}

export default parseArgs
export { expandPath, expandVars, resolveWslPath }
