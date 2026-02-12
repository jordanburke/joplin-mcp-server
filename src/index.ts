#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js"
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js"
import { type CallToolRequest, CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js"
import fs from "fs"
import path from "path"
import { fileURLToPath } from "url"

import parseArgs from "./lib/parse-args.js"
import { initializeJoplinManager } from "./server-core.js"
import { startFastMCPServer } from "./server-fastmcp.js"

// Parse command line arguments and check for transport mode
const parsedArgs = parseArgs()
const { transport, httpPort, host, portExplicitlySet } = parsedArgs

// Check if HTTP transport is requested
const isHttpMode = transport === "http"

// Check for required environment variables
if (!process.env.JOPLIN_TOKEN) {
  process.stderr.write(
    "Error: JOPLIN_TOKEN is required. Use --token <token> or set JOPLIN_TOKEN environment variable.\n",
  )
  process.stderr.write("Find your token in Joplin: Tools > Options > Web Clipper\n")
  process.exit(1)
}

const joplinToken = process.env.JOPLIN_TOKEN

// Use explicit port or default (lazy discovery happens on first tool call)
const joplinPort = portExplicitlySet && process.env.JOPLIN_PORT ? parseInt(process.env.JOPLIN_PORT, 10) : 41184

// Main startup logic
async function main(): Promise<void> {
  if (isHttpMode) {
    console.error("🌐 Starting HTTP transport mode with FastMCP...")
    await startFastMCPServer({
      host,
      port: joplinPort,
      token: joplinToken,
      httpPort,
      endpoint: "/mcp",
    })
  } else {
    console.error("📡 Starting stdio transport mode...")
    await startStdioServer(host, joplinPort, joplinToken)
  }
}

main().catch((error) => {
  console.error("Failed to start MCP server:", error)
  process.exit(1)
})

async function startStdioServer(host: string, port: number, token: string): Promise<void> {
  // Initialize Joplin manager
  const manager = initializeJoplinManager(host, port, token)

  // Create the MCP server using the newer SDK pattern
  const server = new Server(
    {
      name: "joplin-mcp-server",
      version: "1.0.1",
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
      // Log outgoing message (response)
      const logEntry = {
        timestamp: new Date().toISOString(),
        direction: "RESPONSE",
        message,
      }

      // Log to file
      fs.appendFileSync(logFile, JSON.stringify(logEntry) + "\n")

      // Call the original method
      const parent = Object.getPrototypeOf(Object.getPrototypeOf(this))
      return parent.sendMessage.call(this, message)
    }

    async handleMessage(message: unknown): Promise<void> {
      // Log incoming message (command)
      this.commandCounter++
      const logEntry = {
        timestamp: new Date().toISOString(),
        direction: "COMMAND",
        commandNumber: this.commandCounter,
        message,
      }

      // Log to file
      fs.appendFileSync(logFile, JSON.stringify(logEntry) + "\n")

      // Call the original method
      const parent = Object.getPrototypeOf(Object.getPrototypeOf(this))
      return parent.handleMessage.call(this, message)
    }
  }

  // Start the server with logging transport
  const transport = new LoggingTransport()

  try {
    await server.connect(transport)
    console.error("✅ MCP server started and ready to receive commands")
  } catch (error: unknown) {
    process.stderr.write(`Failed to start MCP server: ${error instanceof Error ? error.message : String(error)}\n`)
    process.exit(1)
  }
}
