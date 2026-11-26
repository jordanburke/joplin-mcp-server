#!/usr/bin/env node

declare const __VERSION__: string

import fs from "fs"
import { Option } from "functype"
import path from "path"

import { DEFAULT_API_PORT, JoplinSidecar, type SyncTarget } from "./lib/joplin-sidecar.js"
import parseArgs from "./lib/parse-args.js"
import { externalTokenMissing, resolveTokenSource } from "./lib/resolve-token.js"
import { startHttpServer, startStdioServer } from "./server.js"
import { initializeJoplinManager } from "./server-core.js"

// Parse command line arguments
const parsedArgs = parseArgs()
const { transport, httpPort, httpHost, profileDir, syncTarget, explicitToken } = parsedArgs

const isHttpMode = transport === "http"

// External mode: JOPLIN_HOST/JOPLIN_PORT set = connect directly, skip sidecar.
// Normalize empty strings to undefined so `JOPLIN_HOST=` (a common way to
// "unset" an inherited env var) does not trigger external mode with an empty host.
const externalHost =
  process.env.JOPLIN_HOST !== undefined && process.env.JOPLIN_HOST !== "" ? process.env.JOPLIN_HOST : undefined
const externalPort =
  process.env.JOPLIN_PORT !== undefined && process.env.JOPLIN_PORT !== ""
    ? parseInt(process.env.JOPLIN_PORT, 10)
    : undefined
const externalMode = externalHost !== undefined || externalPort !== undefined

const generateToken = (): string => `mcp-${crypto.randomUUID().replace(/-/g, "").slice(0, 32)}`

const explicitTokenValue = explicitToken.orUndefined()
const ambientToken = process.env.JOPLIN_TOKEN
const tokenInput = { externalMode, explicitToken, ambientToken: Option(ambientToken) }

// External mode connects to a Joplin we do not own, so a caller-supplied token is
// required: an explicit --token first, otherwise the ambient JOPLIN_TOKEN.
if (externalTokenMissing(tokenInput)) {
  process.stderr.write(
    "Error: a token is required in external mode. Use --token <token> or set JOPLIN_TOKEN environment variable.\n",
  )
  process.exit(1)
}

// Read the sidecar's own token from its profile, generating and persisting one on
// first run. Persisting keeps the config hash stable across restarts (so the
// `joplin config` step can be skipped) and lets other MCP processes on the same
// profile converge on one shared sidecar.
const readOrCreateProfileToken = (): string => {
  const tokenPath = path.join(profileDir, ".mcp-token")
  try {
    const saved = fs.readFileSync(tokenPath, "utf-8").trim()
    if (saved) return saved
  } catch {
    // No saved token yet
  }
  const token = generateToken()
  try {
    fs.mkdirSync(profileDir, { recursive: true })
    fs.writeFileSync(tokenPath, token)
  } catch {
    // Non-critical — token still works, just won't be cached
  }
  return token
}

// Token ownership differs by mode (see resolveTokenSource). In sidecar mode an
// ambient JOPLIN_TOKEN belongs to a different Joplin and is deliberately ignored.
const tokenResolution = resolveTokenSource(tokenInput)
if (tokenResolution.ambientIgnored) {
  process.stderr.write(
    "Note: ignoring JOPLIN_TOKEN in sidecar mode; the sidecar manages its own token in the profile. " +
      "Pass --token to set one explicitly, or JOPLIN_HOST/JOPLIN_PORT to connect to an external Joplin.\n",
  )
}
const joplinToken = ((): string => {
  switch (tokenResolution.source) {
    case "explicit":
      return explicitTokenValue ?? generateToken()
    case "external-env":
      return ambientToken ?? generateToken()
    case "external-generated":
      return generateToken()
    case "profile":
      return readOrCreateProfileToken()
  }
})()

async function setupConnection(): Promise<{ host: string; port: number; sidecar: JoplinSidecar | undefined }> {
  if (externalMode) {
    // External mode — connect to existing Joplin instance (e.g. Windows desktop from WSL)
    const host = externalHost ?? "127.0.0.1"
    const port = externalPort ?? DEFAULT_API_PORT
    process.stderr.write(`External mode: connecting to Joplin at ${host}:${port}\n`)
    return { host, port, sidecar: undefined }
  }

  // Sidecar mode — spawn and manage Joplin Terminal
  const sidecar = new JoplinSidecar({
    profileDir,
    apiPort: DEFAULT_API_PORT,
    apiToken: joplinToken,
    syncTarget: syncTarget.orUndefined() as SyncTarget | undefined,
    version: __VERSION__,
  })

  // Phase 1: Resolve port (fast — a few HTTP probes).
  // Must complete before getPort() so downstream gets the correct port.
  const portResult = await sidecar.resolvePort()
  portResult.fold(
    (err) => process.stderr.write(`Warning: Port resolution failed: ${err.message}\n`),
    (p) => process.stderr.write(`Sidecar will use port ${p}\n`),
  )

  // Phase 2: Fire-and-forget the slow startup (CLI config, spawn, wait).
  // ensureConnected() in server-core.ts will await or retry on first tool call.
  void sidecar.start().then((result) => {
    result.fold(
      (err) => {
        process.stderr.write(`Warning: Sidecar failed to start: ${err.message}\n`)
        process.stderr.write("Attempting to connect to existing Joplin instance...\n")
      },
      () => {
        process.stderr.write("Joplin sidecar started successfully\n")
      },
    )
  })

  // Cleanup on exit
  const cleanup = async () => {
    void (await sidecar.stop())
    process.exit(0)
  }
  process.on("SIGINT", () => void cleanup())
  process.on("SIGTERM", () => void cleanup())

  return { host: sidecar.getHost(), port: sidecar.getPort(), sidecar }
}

// Main startup logic
async function main(): Promise<void> {
  const { host, port, sidecar } = await setupConnection()
  const manager = initializeJoplinManager({ host, port, token: joplinToken, sidecar })

  if (isHttpMode) {
    process.stderr.write("Starting HTTP transport mode...\n")
    await startHttpServer(manager, { httpPort, httpHost, endpoint: "/mcp" })
  } else {
    process.stderr.write("Starting stdio transport mode...\n")
    await startStdioServer(manager)
  }
}

main().catch((error) => {
  process.stderr.write(`Failed to start MCP server: ${error}\n`)
  process.exit(1)
})
