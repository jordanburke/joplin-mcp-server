#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js"
import { z } from "zod"
import fs from "fs"
import path from "path"
import { fileURLToPath } from "url"
import parseArgs from "./lib/parse-args.js"
import { startFastMCPServer } from "./server-fastmcp.js"
import { initializeJoplinManager } from "./server-core.js"

// Parse command line arguments and check for transport mode
const args = parseArgs()

// Check if HTTP transport is requested
const isHttpMode = args.includes("--transport") && args[args.indexOf("--transport") + 1] === "http"
const httpPortArg = args.includes("--http-port") ? args[args.indexOf("--http-port") + 1] : "3000"
const httpPort = parseInt(httpPortArg, 10)

// Set default port if not specified
if (!process.env.JOPLIN_PORT) {
  process.env.JOPLIN_PORT = "41184"
}

// Check for required environment variables
if (!process.env.JOPLIN_TOKEN) {
  process.stderr.write(
    "Error: JOPLIN_TOKEN is required. Use --token <token> or set JOPLIN_TOKEN environment variable.\n",
  )
  process.stderr.write("Find your token in Joplin: Tools > Options > Web Clipper\n")
  process.exit(1)
}

const joplinPort = parseInt(process.env.JOPLIN_PORT, 10)
const joplinToken = process.env.JOPLIN_TOKEN

// If HTTP mode is requested, start FastMCP server
if (isHttpMode) {
  console.error("🌐 Starting HTTP transport mode with FastMCP...")
  startFastMCPServer({
    port: joplinPort,
    token: joplinToken,
    httpPort,
    endpoint: "/mcp",
  }).catch((error) => {
    console.error("Failed to start FastMCP server:", error)
    process.exit(1)
  })
} else {
  // Default: Use stdio transport with traditional MCP SDK
  console.error("📡 Starting stdio transport mode...")
  startStdioServer(joplinPort, joplinToken)
}

async function startStdioServer(port: number, token: string): Promise<void> {
  // Initialize Joplin manager
  const manager = initializeJoplinManager(port, token)

  // Create the MCP server
  const server = new McpServer({
    name: "joplin-mcp-server",
    version: "1.0.1",
  })

  // Register all tools using the manager
  registerTools(server, manager)

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

    async sendMessage(message: any): Promise<void> {
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

    async handleMessage(message: any): Promise<void> {
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
  } catch (_error) {
    process.stderr.write(`Failed to start MCP server: ${_error instanceof Error ? _error.message : String(_error)}\n`)
    process.exit(1)
  }
}

function registerTools(server: McpServer, manager: any): void {
  // Register the list_notebooks tool
  server.registerTool(
    "list_notebooks",
    {
      title: "List Notebooks",
      description: "Retrieve the complete notebook hierarchy from Joplin",
      inputSchema: {},
    },
    async () => {
      const result = await manager.listNotebooks()
      return {
        content: [{ type: "text", text: result }],
      }
    },
  )

  // Register the search_notes tool
  server.registerTool(
    "search_notes",
    {
      title: "Search Notes",
      description: "Search for notes in Joplin and return matching notebooks",
      inputSchema: z.object({ query: z.string() }),
    },
    async ({ query }: { query: string }) => {
      const result = await manager.searchNotes(query)
      return {
        content: [{ type: "text", text: result }],
      }
    },
  )

  // Register the read_notebook tool
  server.registerTool(
    "read_notebook",
    {
      title: "Read Notebook",
      description: "Read the contents of a specific notebook",
      inputSchema: z.object({ notebook_id: z.string() }),
    },
    async ({ notebook_id }: { notebook_id: string }) => {
      const result = await manager.readNotebook(notebook_id)
      return {
        content: [{ type: "text", text: result }],
      }
    },
  )

  // Register the read_note tool
  server.registerTool(
    "read_note",
    {
      title: "Read Note",
      description: "Read the full content of a specific note",
      inputSchema: z.object({ note_id: z.string() }),
    },
    async ({ note_id }: { note_id: string }) => {
      const result = await manager.readNote(note_id)
      return {
        content: [{ type: "text", text: result }],
      }
    },
  )

  // Register the read_multinote tool
  server.registerTool(
    "read_multinote",
    {
      title: "Read Multiple Notes",
      description: "Read the full content of multiple notes at once",
      inputSchema: z.object({ note_ids: z.array(z.string()) }),
    },
    async ({ note_ids }: { note_ids: string[] }) => {
      const result = await manager.readMultiNote(note_ids)
      return {
        content: [{ type: "text", text: result }],
      }
    },
  )

  // Register the create_note tool
  server.registerTool(
    "create_note",
    {
      title: "Create Note",
      description: "Create a new note in Joplin",
      inputSchema: z.object({
        title: z.string().optional(),
        body: z.string().optional(),
        body_html: z.string().optional(),
        parent_id: z.string().optional(),
        is_todo: z.boolean().optional(),
        image_data_url: z.string().optional(),
      }),
    },
    async (params: {
      title?: string | undefined
      body?: string | undefined
      body_html?: string | undefined
      parent_id?: string | undefined
      is_todo?: boolean | undefined
      image_data_url?: string | undefined
    }) => {
      const result = await manager.createNote(params)
      return {
        content: [{ type: "text", text: result }],
      }
    },
  )

  // Register the create_folder tool
  server.registerTool(
    "create_folder",
    {
      title: "Create Folder",
      description: "Create a new folder/notebook in Joplin",
      inputSchema: z.object({
        title: z.string(),
        parent_id: z.string().optional(),
      }),
    },
    async (params: { title: string; parent_id?: string | undefined }) => {
      const result = await manager.createFolder(params)
      return {
        content: [{ type: "text", text: result }],
      }
    },
  )

  // Register the edit_note tool
  server.registerTool(
    "edit_note",
    {
      title: "Edit Note",
      description: "Edit/update an existing note in Joplin",
      inputSchema: z.object({
        note_id: z.string(),
        title: z.string().optional(),
        body: z.string().optional(),
        body_html: z.string().optional(),
        parent_id: z.string().optional(),
        is_todo: z.boolean().optional(),
        todo_completed: z.boolean().optional(),
        todo_due: z.number().optional(),
      }),
    },
    async (params: {
      note_id: string
      title?: string | undefined
      body?: string | undefined
      body_html?: string | undefined
      parent_id?: string | undefined
      is_todo?: boolean | undefined
      todo_completed?: boolean | undefined
      todo_due?: number | undefined
    }) => {
      const result = await manager.editNote(params)
      return {
        content: [{ type: "text", text: result }],
      }
    },
  )

  // Register the edit_folder tool
  server.registerTool(
    "edit_folder",
    {
      title: "Edit Folder",
      description: "Edit/update an existing folder/notebook in Joplin",
      inputSchema: z.object({
        folder_id: z.string(),
        title: z.string().optional(),
        parent_id: z.string().optional(),
      }),
    },
    async (params: { folder_id: string; title?: string | undefined; parent_id?: string | undefined }) => {
      const result = await manager.editFolder(params)
      return {
        content: [{ type: "text", text: result }],
      }
    },
  )

  // Register the delete_note tool
  server.registerTool(
    "delete_note",
    {
      title: "Delete Note",
      description: "Delete a note from Joplin (requires confirmation)",
      inputSchema: z.object({
        note_id: z.string(),
        confirm: z.boolean().optional(),
      }),
    },
    async (params: { note_id: string; confirm?: boolean | undefined }) => {
      const result = await manager.deleteNote(params)
      return {
        content: [{ type: "text", text: result }],
      }
    },
  )

  // Register the delete_folder tool
  server.registerTool(
    "delete_folder",
    {
      title: "Delete Folder",
      description: "Delete a folder/notebook from Joplin (requires confirmation)",
      inputSchema: z.object({
        folder_id: z.string(),
        confirm: z.boolean().optional(),
        force: z.boolean().optional(),
      }),
    },
    async (params: { folder_id: string; confirm?: boolean | undefined; force?: boolean | undefined }) => {
      const result = await manager.deleteFolder(params)
      return {
        content: [{ type: "text", text: result }],
      }
    },
  )
}
