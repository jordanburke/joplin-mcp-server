import { resolve } from "path"
import fs from "fs"

export interface ParsedArgs {
  remainingArgs: string[]
  transport: "stdio" | "http"
  httpPort: number
}

function parseArgs(): ParsedArgs {
  const args = process.argv.slice(2)
  let transport: "stdio" | "http" = "stdio"
  let httpPort = 3000

  // Load environment variables without dotenv debug output (for MCP stdio compatibility)
  const loadEnvFile = (envPath: string) => {
    try {
      if (fs.existsSync(envPath)) {
        const envContent = fs.readFileSync(envPath, "utf-8")
        const envLines = envContent.split("\n")

        for (const line of envLines) {
          const trimmedLine = line.trim()
          if (trimmedLine && !trimmedLine.startsWith("#")) {
            const [key, ...valueParts] = trimmedLine.split("=")
            if (key && valueParts.length > 0) {
              const value = valueParts.join("=").replace(/^["']|["']$/g, "")
              if (!process.env[key.trim()]) {
                process.env[key.trim()] = value
              }
            }
          }
        }
      }
    } catch {
      // Silently ignore env file errors
    }
  }

  // Handle --env-file
  if (args.includes("--env-file")) {
    const envFileIndex = args.indexOf("--env-file")
    const envFile = args[envFileIndex + 1]

    if (!envFile || envFile.startsWith("--")) {
      process.stderr.write("Error: --env-file requires a file path\n")
      process.exit(1)
    }

    // Remove the --env-file and its value from args
    args.splice(envFileIndex, 2)

    // Load the environment variables from the specified file
    loadEnvFile(resolve(process.cwd(), envFile))
  } else {
    // Load from default .env file
    loadEnvFile(".env")
  }

  // Handle --port
  if (args.includes("--port")) {
    const portIndex = args.indexOf("--port")
    const port = args[portIndex + 1]

    if (!port || port.startsWith("--")) {
      process.stderr.write("Error: --port requires a port number\n")
      process.exit(1)
    }

    // Remove the --port and its value from args
    args.splice(portIndex, 2)

    // Set environment variable
    process.env.JOPLIN_PORT = port
  }

  // Handle --token
  if (args.includes("--token")) {
    const tokenIndex = args.indexOf("--token")
    const token = args[tokenIndex + 1]

    if (!token || token.startsWith("--")) {
      process.stderr.write("Error: --token requires a token value\n")
      process.exit(1)
    }

    // Remove the --token and its value from args
    args.splice(tokenIndex, 2)

    // Set environment variable
    process.env.JOPLIN_TOKEN = token
  }

  // Handle --transport
  if (args.includes("--transport")) {
    const transportIndex = args.indexOf("--transport")
    const transportValue = args[transportIndex + 1]

    if (!transportValue || transportValue.startsWith("--")) {
      process.stderr.write("Error: --transport requires a transport type (stdio|http)\n")
      process.exit(1)
    }

    if (transportValue !== "stdio" && transportValue !== "http") {
      process.stderr.write("Error: --transport must be either 'stdio' or 'http'\n")
      process.exit(1)
    }

    transport = transportValue as "stdio" | "http"

    // Remove the --transport and its value from args
    args.splice(transportIndex, 2)
  }

  // Handle --http-port
  if (args.includes("--http-port")) {
    const httpPortIndex = args.indexOf("--http-port")
    const httpPortValue = args[httpPortIndex + 1]

    if (!httpPortValue || httpPortValue.startsWith("--")) {
      process.stderr.write("Error: --http-port requires a port number\n")
      process.exit(1)
    }

    httpPort = parseInt(httpPortValue, 10)

    if (isNaN(httpPort) || httpPort < 1 || httpPort > 65535) {
      process.stderr.write("Error: --http-port must be a valid port number (1-65535)\n")
      process.exit(1)
    }

    // Remove the --http-port and its value from args
    args.splice(httpPortIndex, 2)
  }

  // Handle --help
  if (args.includes("--help") || args.includes("-h")) {
    process.stderr.write(`
Joplin MCP Server

USAGE:
  joplin-mcp-server [OPTIONS]

OPTIONS:
  --env-file <file>    Load environment variables from file
  --port <port>        Joplin port (default: 41184)
  --token <token>      Joplin API token
  --transport <type>   Transport type: stdio (default) or http
  --http-port <port>   HTTP server port (default: 3000, only used with --transport http)
  --help, -h           Show this help message

ENVIRONMENT VARIABLES:
  JOPLIN_PORT          Joplin port (default: 41184)
  JOPLIN_TOKEN         Joplin API token (required)
  LOG_LEVEL           Log level: debug, info, warn, error (default: info)

EXAMPLES:
  # Stdio transport (default, for Claude Desktop)
  joplin-mcp-server --port 41184 --token your_token
  joplin-mcp-server --env-file /path/to/.env

  # HTTP transport (for web applications)
  joplin-mcp-server --transport http --http-port 3000 --token your_token
  joplin-mcp-server --env-file .env.local --transport http

Find your Joplin token in: Tools > Options > Web Clipper
`)
    process.exit(0)
  }

  return {
    remainingArgs: args,
    transport,
    httpPort,
  }
}

export default parseArgs
