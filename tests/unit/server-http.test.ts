import { Client } from "@modelcontextprotocol/sdk/client/index.js"
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { ToolError } from "../../src/lib/tools/index.js"

const manager = {
  listNotebooks: vi.fn(),
  readNote: vi.fn(),
  searchNotes: vi.fn(),
}

vi.mock("../../src/server-core.js", () => ({ initializeJoplinManager: () => manager }))

vi.stubGlobal("__VERSION__", "9.9.9")

const { createHttpServer } = await import("../../src/server-http.js")

const MCP_URL = new URL("http://joplin.test/mcp")

const EXPECTED_TOOLS = [
  "create_folder",
  "create_note",
  "delete_folder",
  "delete_note",
  "edit_folder",
  "edit_note",
  "list_notebooks",
  "read_multinote",
  "read_note",
  "read_notebook",
  "search_notes",
  "sync",
]

type TextResult = { content: Array<{ type: string; text?: string }>; isError?: boolean }

describe("HTTP server (somamcp)", () => {
  let server: ReturnType<typeof createHttpServer>["server"]
  let client: Client

  beforeEach(async () => {
    vi.clearAllMocks()
    server = createHttpServer({ host: "127.0.0.1", port: 41184, token: "t" }).server
    client = new Client({ name: "test", version: "1.0.0" })
    await client.connect(
      new StreamableHTTPClientTransport(MCP_URL, {
        fetch: (input, init) => server.fetch(new Request(input, init)),
      }),
    )
  })

  afterEach(async () => {
    await client.close()
  })

  it("lists the same 12 tools as stdio, without somamcp's info tool", async () => {
    const { tools } = await client.listTools()
    expect(tools.map((t) => t.name).sort()).toEqual(EXPECTED_TOOLS)
  })

  it("passes tool arguments through and returns the tool's text", async () => {
    manager.searchNotes.mockResolvedValue("Found 1 note")

    const result = (await client.callTool({ name: "search_notes", arguments: { query: "kale" } })) as TextResult

    expect(manager.searchNotes).toHaveBeenCalledWith("kale")
    expect(result.isError).toBeFalsy()
    expect(result.content).toEqual([{ type: "text", text: "Found 1 note" }])
  })

  it("returns a ToolError as an isError execution failure carrying the tool's message verbatim", async () => {
    manager.readNote.mockRejectedValue(new ToolError('Note with ID "abc" not found.'))

    const result = (await client.callTool({ name: "read_note", arguments: { note_id: "abc" } })) as TextResult

    expect(result.isError).toBe(true)
    // somamcp sends errors as a JSON envelope; a UserError with no suggestions keeps only the message.
    expect(JSON.parse(result.content[0]?.text ?? "")).toEqual({
      errorCategory: "execution",
      message: 'Note with ID "abc" not found.',
      relatedState: { toolName: "read_note" },
    })
  })

  it("rejects missing required arguments before calling the manager", async () => {
    const result = (await client.callTool({ name: "read_note", arguments: {} })) as TextResult

    expect(result.isError).toBe(true)
    expect(manager.readNote).not.toHaveBeenCalled()
  })

  it("answers the public health probe", async () => {
    const response = await server.fetch(new Request("http://joplin.test/health"))
    expect(response.status).toBe(200)
  })
})
