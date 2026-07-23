#!/usr/bin/env node

// Version is injected at build time via tsdown.config.ts define
declare const __VERSION__: string

// Force stdio mode for CLI/npx usage (unless explicitly overridden)
process.env.TRANSPORT_TYPE ??= "stdio"

// Handle command line arguments BEFORE any other imports
const args = process.argv.slice(2)

if (args.includes("--version") || args.includes("-v")) {
  console.log(__VERSION__)
  process.exit(0)
}

if (args.includes("--help") || args.includes("-h")) {
  console.log(`
Joplin MCP Server v${__VERSION__}

Usage: joplin-mcp-server [options]

Options:
  -v, --version        Show version number
  -h, --help           Show help

Environment Variables:
  JOPLIN_TOKEN         API token for external mode; ignored in sidecar mode
  JOPLIN_HOST          Connect to existing Joplin at this host (skips sidecar)
  JOPLIN_PORT          Connect to existing Joplin on this port (skips sidecar)
  JOPLIN_CLI           Path to joplin CLI binary (overrides auto-detection)

For more information, visit: https://github.com/jordanburke/joplin-mcp-server
`)
  process.exit(0)
}

// Import and start server if not showing version/help
async function main() {
  // Import and run the main function from the FastMCP server
  await import("./index.js")
}

void main()
