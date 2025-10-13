#!/usr/bin/env node

// Read package.json dynamically
import fs from "fs"
import path from "path"

interface PackageJson {
  version: string
}

const packageJsonPath = path.join(__dirname, "..", "package.json")
const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf-8")) as PackageJson

// Force stdio mode for CLI/npx usage (unless explicitly overridden)
if (!process.env.TRANSPORT_TYPE) {
  process.env.TRANSPORT_TYPE = "stdio"
}

// Handle command line arguments BEFORE any other imports
const args = process.argv.slice(2)

if (args.includes("--version") || args.includes("-v")) {
  console.log(packageJson.version)
  process.exit(0)
}

// Only import and start server if not showing version/help
main().then()

if (args.includes("--help") || args.includes("-h")) {
  console.log(`
Joplin MCP Server v${packageJson.version}

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
  // The index.js exports main() directly, so we just need to execute the file
  // The main() is already executed when the module is imported
}
