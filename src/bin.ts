#!/usr/bin/env node

// Static import of a pure string module: safe before the arg handling below,
// unlike ./index.js, which starts the server on import.
import { helpText } from "./lib/help-text.js"

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
  console.log(helpText(__VERSION__))
  process.exit(0)
}

// Import and start server if not showing version/help
async function main() {
  // Import and run the main function from the FastMCP server
  await import("./index.js")
}

void main()
