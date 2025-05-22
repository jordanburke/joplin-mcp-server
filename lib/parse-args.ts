import dotenv from "dotenv"
import { fileURLToPath } from "url"
import { dirname, resolve } from "path"

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

function parseArgs(): string[] {
  const args = process.argv.slice(2)

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
    dotenv.config({ path: resolve(process.cwd(), envFile) })
  } else {
    // Load from default .env file
    dotenv.config()
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
  --help, -h           Show this help message

ENVIRONMENT VARIABLES:
  JOPLIN_PORT          Joplin port (default: 41184)
  JOPLIN_TOKEN         Joplin API token (required)
  LOG_LEVEL           Log level: debug, info, warn, error (default: info)

EXAMPLES:
  joplin-mcp-server --port 41184 --token your_token
  joplin-mcp-server --env-file /path/to/.env
  joplin-mcp-server --env-file .env.local --port 41185

Find your Joplin token in: Tools > Options > Web Clipper
`)
    process.exit(0)
  }

  return args
}

export default parseArgs
