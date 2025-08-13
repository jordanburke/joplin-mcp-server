import { FastMCP } from "fastmcp"
import { z } from "zod"
import { JoplinServerManager, initializeJoplinManager } from "./server-core.js"

export interface FastMCPServerOptions {
  port: number
  token: string
  httpPort?: number
  endpoint?: string
}

export function createFastMCPServer(options: FastMCPServerOptions): { server: FastMCP; manager: JoplinServerManager } {
  console.error("🚀 Initializing FastMCP server for Joplin...")

  // Initialize Joplin manager
  const manager = initializeJoplinManager(options.port, options.token)

  // Create FastMCP server
  const server = new FastMCP({
    name: "joplin",
    version: "1.0.1",
    health: {
      enabled: true,
      path: "/health",
      status: 200,
      message: JSON.stringify({
        status: "healthy",
        service: "joplin-mcp-server",
        version: "1.0.1",
        joplinPort: options.port,
        timestamp: new Date().toISOString(),
      }),
    },
  })

  // Add list_notebooks tool
  server.addTool({
    name: "list_notebooks",
    description: "Retrieve the complete notebook hierarchy from Joplin",
    parameters: z.object({}),
    execute: async () => {
      return await manager.listNotebooks()
    },
  })

  // Add search_notes tool
  server.addTool({
    name: "search_notes",
    description: "Search for notes in Joplin and return matching notebooks",
    parameters: z.object({
      query: z.string().describe("Search query for notes"),
    }),
    execute: async (args) => {
      return await manager.searchNotes(args.query)
    },
  })

  // Add read_notebook tool
  server.addTool({
    name: "read_notebook",
    description: "Read the contents of a specific notebook",
    parameters: z.object({
      notebook_id: z.string().describe("ID of the notebook to read"),
    }),
    execute: async (args) => {
      return await manager.readNotebook(args.notebook_id)
    },
  })

  // Add read_note tool
  server.addTool({
    name: "read_note",
    description: "Read the full content of a specific note",
    parameters: z.object({
      note_id: z.string().describe("ID of the note to read"),
    }),
    execute: async (args) => {
      return await manager.readNote(args.note_id)
    },
  })

  // Add read_multinote tool
  server.addTool({
    name: "read_multinote",
    description: "Read the full content of multiple notes at once",
    parameters: z.object({
      note_ids: z.array(z.string()).describe("Array of note IDs to read"),
    }),
    execute: async (args) => {
      return await manager.readMultiNote(args.note_ids)
    },
  })

  // Add create_note tool
  server.addTool({
    name: "create_note",
    description: "Create a new note in Joplin",
    parameters: z.object({
      title: z.string().optional().describe("Note title"),
      body: z.string().optional().describe("Note content in Markdown"),
      body_html: z.string().optional().describe("Note content in HTML"),
      parent_id: z.string().optional().describe("ID of parent notebook"),
      is_todo: z.boolean().optional().describe("Whether this is a todo note"),
      image_data_url: z.string().optional().describe("Base64 encoded image data URL"),
    }),
    execute: async (args) => {
      return await manager.createNote(args)
    },
  })

  // Add create_folder tool
  server.addTool({
    name: "create_folder",
    description: "Create a new folder/notebook in Joplin",
    parameters: z.object({
      title: z.string().describe("Notebook title"),
      parent_id: z.string().optional().describe("ID of parent notebook"),
    }),
    execute: async (args) => {
      return await manager.createFolder(args)
    },
  })

  // Add edit_note tool
  server.addTool({
    name: "edit_note",
    description: "Edit/update an existing note in Joplin",
    parameters: z.object({
      note_id: z.string().describe("ID of the note to edit"),
      title: z.string().optional().describe("New note title"),
      body: z.string().optional().describe("New note content in Markdown"),
      body_html: z.string().optional().describe("New note content in HTML"),
      parent_id: z.string().optional().describe("New parent notebook ID"),
      is_todo: z.boolean().optional().describe("Whether this is a todo note"),
      todo_completed: z.boolean().optional().describe("Whether todo is completed"),
      todo_due: z.number().optional().describe("Todo due date (Unix timestamp)"),
    }),
    execute: async (args) => {
      return await manager.editNote(args)
    },
  })

  // Add edit_folder tool
  server.addTool({
    name: "edit_folder",
    description: "Edit/update an existing folder/notebook in Joplin",
    parameters: z.object({
      folder_id: z.string().describe("ID of the folder to edit"),
      title: z.string().optional().describe("New folder title"),
      parent_id: z.string().optional().describe("New parent folder ID"),
    }),
    execute: async (args) => {
      return await manager.editFolder(args)
    },
  })

  // Add delete_note tool
  server.addTool({
    name: "delete_note",
    description: "Delete a note from Joplin (requires confirmation)",
    parameters: z.object({
      note_id: z.string().describe("ID of the note to delete"),
      confirm: z.boolean().optional().describe("Confirmation flag"),
    }),
    execute: async (args) => {
      return await manager.deleteNote(args)
    },
  })

  // Add delete_folder tool
  server.addTool({
    name: "delete_folder",
    description: "Delete a folder/notebook from Joplin (requires confirmation)",
    parameters: z.object({
      folder_id: z.string().describe("ID of the folder to delete"),
      confirm: z.boolean().optional().describe("Confirmation flag"),
      force: z.boolean().optional().describe("Force delete even if folder has contents"),
    }),
    execute: async (args) => {
      return await manager.deleteFolder(args)
    },
  })

  console.error("✅ FastMCP server configured with 11 Joplin tools")
  return { server, manager }
}

export async function startFastMCPServer(options: FastMCPServerOptions): Promise<void> {
  const { server, manager } = createFastMCPServer(options)

  // Check Joplin service availability
  console.error("🔍 Checking Joplin service availability...")
  const available = await manager.checkService()
  if (!available) {
    console.error("❌ Joplin service is not available. Please ensure:")
    console.error("  1. Joplin is running")
    console.error("  2. Web Clipper is enabled (Tools > Options > Web Clipper)")
    console.error(`  3. Joplin is running on port ${options.port}`)
    console.error("  4. The API token is correct")
    process.exit(1)
  }
  console.error("✅ Joplin service is available")

  // Start the server with HTTP streaming transport
  const port = options.httpPort || 3000
  const endpoint = options.endpoint || "/mcp"

  await server.start({
    transportType: "httpStream",
    httpStream: {
      port,
      endpoint: endpoint as `/${string}`,
    },
  })

  console.error(`✓ FastMCP server running on http://0.0.0.0:${port}${endpoint}`)
  console.error("🔌 Connect with StreamableHTTPClientTransport")
}
