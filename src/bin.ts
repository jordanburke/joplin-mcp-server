#!/usr/bin/env node

// Version is injected at build time via tsdown.config.ts define
declare const __VERSION__: string

// Force stdio mode for CLI/npx usage (unless explicitly overridden)
if (!process.env.TRANSPORT_TYPE) {
  process.env.TRANSPORT_TYPE = "stdio"
}

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
  JOPLIN_PORT          Joplin API port (default: 41184)
  JOPLIN_TOKEN         Joplin API token (required)

For more information, visit: https://github.com/jordanburke/joplin-mcp-server
`)
  process.exit(0)
}

// Import and start server if not showing version/help
async function main() {
  // Import and run the main function from the FastMCP server
  await import("./index.js")
}

main().then()
