#!/usr/bin/env node

declare const __VERSION__: string

import { Server } from "@modelcontextprotocol/sdk/server/index.js"
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js"
import { type CallToolRequest, CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js"
import fs from "fs"
import path from "path"
import { fileURLToPath } from "url"

import { DEFAULT_API_PORT, JoplinSidecar, type SyncTarget } from "./lib/joplin-sidecar.js"
import parseArgs from "./lib/parse-args.js"
import { initializeJoplinManager } from "./server-core.js"
import { startFastMCPServer } from "./server-fastmcp.js"

// Parse command line arguments
const parsedArgs = parseArgs()
const { transport, httpPort, profileDir, syncTarget } = parsedArgs

const isHttpMode = transport === "http"

// External mode: JOPLIN_HOST/JOPLIN_PORT set = connect directly, skip sidecar
const externalHost = process.env.JOPLIN_HOST
const externalPort = process.env.JOPLIN_PORT ? parseInt(process.env.JOPLIN_PORT, 10) : undefined
const externalMode = !!(externalHost || externalPort)

// Token is required for external mode, auto-generated for sidecar mode
if (!process.env.JOPLIN_TOKEN && externalMode) {
  process.stderr.write(
    "Error: JOPLIN_TOKEN is required in external mode. Use --token <token> or set JOPLIN_TOKEN environment variable.\n",
  )
  process.exit(1)
}

// In sidecar mode, persist the auto-generated token so the config hash stays stable
// across restarts, enabling config caching to skip redundant `joplin config` CLI calls.
const joplinToken = (() => {
  if (process.env.JOPLIN_TOKEN) return process.env.JOPLIN_TOKEN
  if (externalMode) return `mcp-${crypto.randomUUID().replace(/-/g, "").slice(0, 32)}`
  const tokenPath = path.join(profileDir, ".mcp-token")
  try {
    const saved = fs.readFileSync(tokenPath, "utf-8").trim()
    if (saved) return saved
  } catch {
    // No saved token yet
  }
  const token = `mcp-${crypto.randomUUID().replace(/-/g, "").slice(0, 32)}`
  try {
    fs.mkdirSync(profileDir, { recursive: true })
    fs.writeFileSync(tokenPath, token)
  } catch {
    // Non-critical — token still works, just won't be cached
  }
  return token
})()

// Main startup logic
async function main(): Promise<void> {
  let host: string
  let port: number
  let sidecar: JoplinSidecar | undefined

  if (externalMode) {
    // External mode — connect to existing Joplin instance (e.g. Windows desktop from WSL)
    host = externalHost || "127.0.0.1"
    port = externalPort || DEFAULT_API_PORT
    process.stderr.write(`External mode: connecting to Joplin at ${host}:${port}\n`)
  } else {
    // Sidecar mode — spawn and manage Joplin Terminal
    sidecar = new JoplinSidecar({
      profileDir,
      apiPort: DEFAULT_API_PORT,
      apiToken: joplinToken,
      syncTarget: syncTarget.orUndefined() as SyncTarget | undefined,
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
    sidecar.start().then((result) => {
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

    host = sidecar.getHost()
    port = sidecar.getPort()

    // Cleanup on exit
    const cleanup = async () => {
      await sidecar!.stop()
      process.exit(0)
    }
    process.on("SIGINT", () => void cleanup())
    process.on("SIGTERM", () => void cleanup())
  }

  if (isHttpMode) {
    process.stderr.write("Starting HTTP transport mode with FastMCP...\n")
    await startFastMCPServer({
      host,
      port,
      token: joplinToken,
      httpPort,
      endpoint: "/mcp",
    })
  } else {
    process.stderr.write("Starting stdio transport mode...\n")
    await startStdioServer(host, port, joplinToken, sidecar)
  }
}

main().catch((error) => {
  process.stderr.write(`Failed to start MCP server: ${error}\n`)
  process.exit(1)
})

async function startStdioServer(host: string, port: number, token: string, sidecar?: JoplinSidecar): Promise<void> {
  const manager = initializeJoplinManager({ host, port, token, sidecar })

  const server = new Server(
    {
      name: "joplin-mcp-server",
      version: __VERSION__,
    },
    {
      capabilities: {
        resources: {},
        tools: {},
        prompts: {},
      },
    },
  )

  // Register tool list handler
  server.setRequestHandler(ListToolsRequestSchema, () => {
    return {
      tools: [
        {
          name: "list_notebooks",
          description: "Retrieve the complete notebook hierarchy from Joplin",
          inputSchema: {
            type: "object",
            properties: {},
          },
        },
        {
          name: "search_notes",
          description: "Search for notes in Joplin and return matching notebooks",
          inputSchema: {
            type: "object",
            properties: {
              query: { type: "string", description: "Search query" },
            },
            required: ["query"],
          },
        },
        {
          name: "read_notebook",
          description: "Read the contents of a specific notebook",
          inputSchema: {
            type: "object",
            properties: {
              notebook_id: { type: "string", description: "ID of the notebook to read" },
            },
            required: ["notebook_id"],
          },
        },
        {
          name: "read_note",
          description: "Read the full content of a specific note",
          inputSchema: {
            type: "object",
            properties: {
              note_id: { type: "string", description: "ID of the note to read" },
            },
            required: ["note_id"],
          },
        },
        {
          name: "read_multinote",
          description: "Read the full content of multiple notes at once",
          inputSchema: {
            type: "object",
            properties: {
              note_ids: { type: "array", items: { type: "string" }, description: "Array of note IDs to read" },
            },
            required: ["note_ids"],
          },
        },
        {
          name: "create_note",
          description: "Create a new note in Joplin",
          inputSchema: {
            type: "object",
            properties: {
              title: { type: "string", description: "Note title" },
              body: { type: "string", description: "Note content in Markdown" },
              body_html: { type: "string", description: "Note content in HTML" },
              parent_id: { type: "string", description: "ID of parent notebook" },
              is_todo: { type: "boolean", description: "Whether this is a todo note" },
              image_data_url: { type: "string", description: "Base64 encoded image data URL" },
            },
          },
        },
        {
          name: "create_folder",
          description: "Create a new folder/notebook in Joplin",
          inputSchema: {
            type: "object",
            properties: {
              title: { type: "string", description: "Notebook title" },
              parent_id: { type: "string", description: "ID of parent notebook" },
            },
            required: ["title"],
          },
        },
        {
          name: "edit_note",
          description: "Edit/update an existing note in Joplin",
          inputSchema: {
            type: "object",
            properties: {
              note_id: { type: "string", description: "ID of the note to edit" },
              title: { type: "string", description: "New note title" },
              body: { type: "string", description: "New note content in Markdown" },
              body_html: { type: "string", description: "New note content in HTML" },
              parent_id: { type: "string", description: "New parent notebook ID" },
              is_todo: { type: "boolean", description: "Whether this is a todo note" },
              todo_completed: { type: "boolean", description: "Whether todo is completed" },
              todo_due: { type: "number", description: "Todo due date (Unix timestamp)" },
            },
            required: ["note_id"],
          },
        },
        {
          name: "edit_folder",
          description: "Edit/update an existing folder/notebook in Joplin",
          inputSchema: {
            type: "object",
            properties: {
              folder_id: { type: "string", description: "ID of the folder to edit" },
              title: { type: "string", description: "New folder title" },
              parent_id: { type: "string", description: "New parent folder ID" },
            },
            required: ["folder_id"],
          },
        },
        {
          name: "delete_note",
          description: "Delete a note from Joplin (requires confirmation)",
          inputSchema: {
            type: "object",
            properties: {
              note_id: { type: "string", description: "ID of the note to delete" },
              confirm: { type: "boolean", description: "Confirmation flag" },
            },
            required: ["note_id"],
          },
        },
        {
          name: "delete_folder",
          description: "Delete a folder/notebook from Joplin (requires confirmation)",
          inputSchema: {
            type: "object",
            properties: {
              folder_id: { type: "string", description: "ID of the folder to delete" },
              confirm: { type: "boolean", description: "Confirmation flag" },
              force: { type: "boolean", description: "Force delete even if folder has contents" },
            },
            required: ["folder_id"],
          },
        },
        {
          name: "sync",
          description: "Trigger a Joplin sync to push/pull changes with the configured sync target",
          inputSchema: {
            type: "object",
            properties: {},
          },
        },
      ],
    }
  })

  // Register tool call handler
  server.setRequestHandler(CallToolRequestSchema, async (request: CallToolRequest) => {
    const toolName = request.params.name
    const args = request.params.arguments || {}

    try {
      switch (toolName) {
        case "list_notebooks": {
          const listResult = await manager.listNotebooks()
          return { content: [{ type: "text", text: listResult }], isError: false }
        }

        case "search_notes": {
          const searchResult = await manager.searchNotes(args.query as string)
          return { content: [{ type: "text", text: searchResult }], isError: false }
        }

        case "read_notebook": {
          const notebookResult = await manager.readNotebook(args.notebook_id as string)
          return { content: [{ type: "text", text: notebookResult }], isError: false }
        }

        case "read_note": {
          const noteResult = await manager.readNote(args.note_id as string)
          return { content: [{ type: "text", text: noteResult }], isError: false }
        }

        case "read_multinote": {
          const multiResult = await manager.readMultiNote(args.note_ids as string[])
          return { content: [{ type: "text", text: multiResult }], isError: false }
        }

        case "create_note": {
          const createNoteResult = await manager.createNote(
            args as {
              title?: string | undefined
              body?: string | undefined
              body_html?: string | undefined
              parent_id?: string | undefined
              is_todo?: boolean | undefined
              image_data_url?: string | undefined
            },
          )
          return { content: [{ type: "text", text: createNoteResult }], isError: false }
        }

        case "create_folder": {
          const createFolderResult = await manager.createFolder(
            args as {
              title: string
              parent_id?: string | undefined
            },
          )
          return { content: [{ type: "text", text: createFolderResult }], isError: false }
        }

        case "edit_note": {
          const editNoteResult = await manager.editNote(
            args as {
              note_id: string
              title?: string | undefined
              body?: string | undefined
              body_html?: string | undefined
              parent_id?: string | undefined
              is_todo?: boolean | undefined
              todo_completed?: boolean | undefined
              todo_due?: number | undefined
            },
          )
          return { content: [{ type: "text", text: editNoteResult }], isError: false }
        }

        case "edit_folder": {
          const editFolderResult = await manager.editFolder(
            args as {
              folder_id: string
              title?: string | undefined
              parent_id?: string | undefined
            },
          )
          return { content: [{ type: "text", text: editFolderResult }], isError: false }
        }

        case "delete_note": {
          const deleteNoteResult = await manager.deleteNote(
            args as {
              note_id: string
              confirm?: boolean | undefined
            },
          )
          return { content: [{ type: "text", text: deleteNoteResult }], isError: false }
        }

        case "delete_folder": {
          const deleteFolderResult = await manager.deleteFolder(
            args as {
              folder_id: string
              confirm?: boolean | undefined
              force?: boolean | undefined
            },
          )
          return { content: [{ type: "text", text: deleteFolderResult }], isError: false }
        }

        case "sync": {
          const syncResult = await manager.sync()
          return { content: [{ type: "text", text: syncResult }], isError: false }
        }

        default:
          throw new Error(`Unknown tool: ${toolName}`)
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      return {
        content: [{ type: "text", text: `Error: ${errorMessage}` }],
        isError: true,
      }
    }
  })

  // Create logs directory if it doesn't exist
  const __filename = fileURLToPath(import.meta.url)
  const __dirname = path.dirname(__filename)
  const logsDir = path.join(__dirname, "..", "logs")

  if (!fs.existsSync(logsDir)) {
    fs.mkdirSync(logsDir, { recursive: true })
  }

  // Create a log file for this session
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-")
  const logFile = path.join(logsDir, `mcp-server-${timestamp}.log`)

  // Create a custom transport wrapper to log commands and responses
  class LoggingTransport extends StdioServerTransport {
    private commandCounter: number

    constructor() {
      super()
      this.commandCounter = 0
    }

    async sendMessage(message: unknown): Promise<void> {
      const logEntry = {
        timestamp: new Date().toISOString(),
        direction: "RESPONSE",
        message,
      }

      fs.appendFileSync(logFile, JSON.stringify(logEntry) + "\n")

      const parent = Object.getPrototypeOf(Object.getPrototypeOf(this))
      return parent.sendMessage.call(this, message)
    }

    async handleMessage(message: unknown): Promise<void> {
      this.commandCounter++
      const logEntry = {
        timestamp: new Date().toISOString(),
        direction: "COMMAND",
        commandNumber: this.commandCounter,
        message,
      }

      fs.appendFileSync(logFile, JSON.stringify(logEntry) + "\n")

      const parent = Object.getPrototypeOf(Object.getPrototypeOf(this))
      return parent.handleMessage.call(this, message)
    }
  }

  const stdioTransport = new LoggingTransport()

  try {
    await server.connect(stdioTransport)
    process.stderr.write("MCP server started and ready to receive commands\n")
  } catch (error: unknown) {
    process.stderr.write(`Failed to start MCP server: ${error instanceof Error ? error.message : String(error)}\n`)
    process.exit(1)
  }
}
