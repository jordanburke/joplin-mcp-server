import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

import {
  createJsonFileTelemetry,
  createServer,
  type SomaServerInstance,
  type TelemetryCollector,
  UserError,
} from "somamcp/node"
import { z } from "zod"

import { ToolError } from "./lib/tools/index.js"
import type { JoplinServerManager } from "./server-core.js"

declare const __VERSION__: `${number}.${number}.${number}`

/**
 * Convert a ToolError thrown by a tool into a somamcp UserError, so the agent gets the tool's own
 * message with isError: true, labelled as an execution failure with no generic suggestions.
 */
const runWithUserError = async <T>(fn: () => Promise<T>): Promise<T> => {
  try {
    return await fn()
  } catch (e) {
    if (e instanceof ToolError) throw new UserError(e.message, { suggestions: [] })
    throw e
  }
}

export type JoplinServerOptions = {
  /** Where tool calls are recorded. stdio writes them to a file in `logs/`; HTTP records none. */
  telemetry?: TelemetryCollector
}

export type HttpServerOptions = {
  httpPort?: number
  /** The interface to listen on. Defaults to localhost; the Docker image passes 0.0.0.0. */
  httpHost?: string
  endpoint?: string
}

/** The Joplin MCP server, with every tool registered. Both transports serve this same server. */
export function createJoplinServer(
  manager: JoplinServerManager,
  options: JoplinServerOptions = {},
): SomaServerInstance {
  // The `info` introspection tool is left out, so the tool list is exactly Joplin's 12 tools.
  const server = createServer({
    name: "joplin-mcp-server",
    version: __VERSION__,
    enableIntrospection: false,
    // A note created with an inline image_data_url can be several MB. 10 MiB matches what FastMCP accepted.
    maxRequestBodySize: 10 * 1024 * 1024,
    ...(options.telemetry ? { telemetry: options.telemetry } : {}),
  })

  // Add list_notebooks tool
  server.addTool({
    name: "list_notebooks",
    description: "Retrieve the complete notebook hierarchy from Joplin",
    parameters: z.object({}),
    execute: () => runWithUserError(() => manager.listNotebooks()),
  })

  // Add search_notes tool
  server.addTool({
    name: "search_notes",
    description: "Search for notes in Joplin and return matching notebooks",
    parameters: z.object({
      query: z.string().describe("Search query for notes"),
    }),
    execute: (args) => runWithUserError(() => manager.searchNotes(args.query)),
  })

  // Add read_notebook tool
  server.addTool({
    name: "read_notebook",
    description: "Read the contents of a specific notebook",
    parameters: z.object({
      notebook_id: z.string().describe("ID of the notebook to read"),
    }),
    execute: (args) => runWithUserError(() => manager.readNotebook(args.notebook_id)),
  })

  // Add read_note tool
  server.addTool({
    name: "read_note",
    description: "Read the full content of a specific note",
    parameters: z.object({
      note_id: z.string().describe("ID of the note to read"),
    }),
    execute: (args) => runWithUserError(() => manager.readNote(args.note_id)),
  })

  // Add read_multinote tool
  server.addTool({
    name: "read_multinote",
    description: "Read the full content of multiple notes at once",
    parameters: z.object({
      note_ids: z.array(z.string()).describe("Array of note IDs to read"),
    }),
    execute: (args) => runWithUserError(() => manager.readMultiNote(args.note_ids)),
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
    execute: (args) => runWithUserError(() => manager.createNote(args)),
  })

  // Add create_folder tool
  server.addTool({
    name: "create_folder",
    description: "Create a new folder/notebook in Joplin",
    parameters: z.object({
      title: z.string().describe("Notebook title"),
      parent_id: z.string().optional().describe("ID of parent notebook"),
    }),
    execute: (args) => runWithUserError(() => manager.createFolder(args)),
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
    execute: (args) => runWithUserError(() => manager.editNote(args)),
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
    execute: (args) => runWithUserError(() => manager.editFolder(args)),
  })

  // Add delete_note tool
  server.addTool({
    name: "delete_note",
    description: "Delete a note from Joplin (requires confirmation)",
    parameters: z.object({
      note_id: z.string().describe("ID of the note to delete"),
      confirm: z.boolean().optional().describe("Confirmation flag"),
    }),
    execute: (args) => runWithUserError(() => manager.deleteNote(args)),
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
    execute: (args) => runWithUserError(() => manager.deleteFolder(args)),
  })

  // Add sync tool
  server.addTool({
    name: "sync",
    description: "Trigger a Joplin sync to push/pull changes with the configured sync target",
    parameters: z.object({}),
    execute: () => runWithUserError(() => manager.sync()),
  })

  return server
}

export async function startHttpServer(manager: JoplinServerManager, options: HttpServerOptions = {}): Promise<void> {
  const server = createJoplinServer(manager)

  const port = options.httpPort ?? 3000
  // A blank host would listen on every interface, so it falls back to localhost too.
  const host = options.httpHost !== undefined && options.httpHost.trim() !== "" ? options.httpHost : "localhost"
  const endpoint = options.endpoint ?? "/mcp"

  await server.start({
    transportType: "httpStream",
    httpStream: {
      host,
      port,
      endpoint: endpoint as `/${string}`,
    },
  })

  process.stderr.write(`somamcp server running on http://${host}:${port}${endpoint}\n`)
}

/** The log file for this stdio session, in `logs/` next to `dist/`, where the server always kept them. */
const stdioLogFile = (): string => {
  const logsDir = join(dirname(fileURLToPath(import.meta.url)), "..", "logs")
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-")
  return join(logsDir, `mcp-server-${timestamp}.ndjson`)
}

export async function startStdioServer(manager: JoplinServerManager): Promise<void> {
  const server = createJoplinServer(manager, { telemetry: createJsonFileTelemetry({ filePath: stdioLogFile() }) })
  await server.start({ transportType: "stdio" })
  process.stderr.write("MCP server started and ready to receive commands\n")
}
