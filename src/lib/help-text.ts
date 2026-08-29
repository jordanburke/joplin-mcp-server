// The full CLI help. Kept in its own side-effect-free module so src/bin.ts can
// print it without importing the server, which starts on import.
export const helpText = (version?: string): string => {
  const title =
    version === undefined ? "Joplin MCP Server (Sidecar Mode)" : `Joplin MCP Server v${version} (Sidecar Mode)`

  return `
${title}

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
  --sync-path <url>          URL or path for sync target (bucket name for s3)
  --sync-username <user>     Username/email for sync (access key for s3)
  --sync-password <pass>     Password for sync (secret key for s3)
  --sync-region <region>     S3 region (default: us-east-1)
  --sync-endpoint <url>      S3 endpoint URL for non-AWS providers
                             (default: https://s3.amazonaws.com/)
  --sync-force-path-style <bool>
                             Use path-style S3 URLs: true or false (default: false)
  --help, -h                 Show this help message
  --version, -v              Show version number

ENVIRONMENT VARIABLES:
  JOPLIN_TOKEN               API token for external mode (JOPLIN_HOST/JOPLIN_PORT).
                             Ignored in sidecar mode, which manages its own token.
  JOPLIN_HOST                Connect to existing Joplin at this host (skips sidecar)
  JOPLIN_PORT                Connect to existing Joplin on this port (skips sidecar)
  JOPLIN_CLI                 Path to joplin CLI binary (overrides auto-detection)
  JOPLIN_PROFILE             Joplin data directory
  JOPLIN_SYNC_TARGET         Sync target type
  JOPLIN_SYNC_PATH           Sync target URL/path
  JOPLIN_SYNC_USERNAME       Sync username/email
  JOPLIN_SYNC_PASSWORD       Sync password
  JOPLIN_SYNC_REGION         S3 region
  JOPLIN_SYNC_ENDPOINT       S3 endpoint URL
  JOPLIN_SYNC_FORCE_PATH_STYLE
                             Use path-style S3 URLs (true/false)
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

  # S3 sync on a non-AWS provider (Backblaze B2)
  joplin-mcp-server --token my_token \\
    --sync-target s3 --sync-path my-bucket \\
    --sync-region us-west-004 \\
    --sync-endpoint https://s3.us-west-004.backblazeb2.com \\
    --sync-username <access-key> --sync-password <secret-key>

  # Filesystem sync (Syncthing, NAS)
  joplin-mcp-server --token my_token \\
    --sync-target filesystem --sync-path /mnt/sync/joplin

  # HTTP transport for web apps
  joplin-mcp-server --token my_token --transport http --http-port 3000

  # External mode - connect to existing Joplin (e.g. Windows desktop from WSL)
  JOPLIN_HOST=172.x.x.x JOPLIN_PORT=41184 joplin-mcp-server --token my_token

Find your Joplin token in: Tools > Options > Web Clipper
`
}
