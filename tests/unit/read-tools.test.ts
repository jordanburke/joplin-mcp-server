import { describe, it, expect, beforeEach, vi } from "vitest"
import { Right, Left } from "functype"
import JoplinAPIClient from "../../src/lib/joplin-api-client.js"
import ReadNote from "../../src/lib/tools/read-note.js"
import ReadNotebook from "../../src/lib/tools/read-notebook.js"

const mockApiClient = {
  get: vi.fn(),
}

vi.mock("../../src/lib/joplin-api-client.js", function () {
  return {
    default: vi.fn(function () {
      return mockApiClient
    }),
  }
})

const VALID_ID = "a1b2c3d4e5f6789012345678901234567890abcd"

describe("Read Tools", () => {
  let readNote: ReadNote
  let readNotebook: ReadNotebook

  beforeEach(() => {
    vi.clearAllMocks()
    const client = new JoplinAPIClient({ token: "test-token" })
    readNote = new ReadNote(client)
    readNotebook = new ReadNotebook(client)
  })

  describe("ReadNotebook", () => {
    const mockNotebook = {
      id: "notebook-123",
      title: "Test Notebook",
      parent_id: null,
    }

    const mockNotes = {
      items: [
        {
          id: "note-1",
          title: "First Note",
          updated_time: 1234567890000,
          is_todo: false,
          todo_completed: false,
        },
        {
          id: "note-2",
          title: "Second Note (todo)",
          updated_time: 1234567891000,
          is_todo: true,
          todo_completed: true,
        },
      ],
    }

    it("should list notes in a notebook", async () => {
      mockApiClient.get.mockResolvedValueOnce(Right(mockNotebook)).mockResolvedValueOnce(Right(mockNotes))

      const result = await readNotebook.call(VALID_ID)

      expect(mockApiClient.get).toHaveBeenCalledWith(`/folders/${VALID_ID}`, {
        query: { fields: "id,title,parent_id" },
      })
      expect(mockApiClient.get).toHaveBeenCalledWith(`/folders/${VALID_ID}/notes`, {
        query: { fields: "id,title,updated_time,is_todo,todo_completed" },
      })
      expect(result).toContain(`# Notebook: "Test Notebook"`)
      expect(result).toContain("Contains 2 notes")
      expect(result).toContain("First Note")
      expect(result).toContain("Second Note (todo)")
      expect(result).toContain("✅") // completed todo checkbox
    })

    it("should sort notes by updated_time descending", async () => {
      mockApiClient.get.mockResolvedValueOnce(Right(mockNotebook)).mockResolvedValueOnce(Right(mockNotes))

      const result = await readNotebook.call(VALID_ID)

      // Second Note has a newer updated_time, so it should appear before First Note
      const secondIndex = result.indexOf("Second Note (todo)")
      const firstIndex = result.indexOf("First Note")
      expect(secondIndex).toBeGreaterThan(-1)
      expect(firstIndex).toBeGreaterThan(secondIndex)
    })

    it("should report an empty notebook", async () => {
      mockApiClient.get.mockResolvedValueOnce(Right(mockNotebook)).mockResolvedValueOnce(Right({ items: [] }))

      const result = await readNotebook.call(VALID_ID)

      expect(result).toContain(`Notebook "Test Notebook"`)
      expect(result).toContain("is empty")
    })

    it("should validate notebook id format", async () => {
      const result = await readNotebook.call("short")

      expect(result).toContain("does not appear to be a valid notebook ID")
      expect(mockApiClient.get).not.toHaveBeenCalled()
    })

    it("should throw with Joplin's error message when the folder lookup body has an error field", async () => {
      // Joplin can return HTTP 200 with `{ error: "..." }` instead of a real folder.
      mockApiClient.get.mockResolvedValueOnce(Right({ error: "Permission denied" }))

      await expect(readNotebook.call(VALID_ID)).rejects.toThrow(/Permission denied/)
    })

    it("should throw when API responds 404", async () => {
      const error = new Error("Not found")
      ;(error as any).response = { status: 404 }
      mockApiClient.get.mockResolvedValueOnce(Left(error))

      await expect(readNotebook.call(VALID_ID)).rejects.toThrow(/Notebook with ID .* not found/)
    })

    it("should throw with Joplin's error message when the notes-listing body has an error field", async () => {
      mockApiClient.get
        .mockResolvedValueOnce(Right(mockNotebook))
        .mockResolvedValueOnce(Right({ error: "Internal Server Error" }))

      await expect(readNotebook.call(VALID_ID)).rejects.toThrow(/Internal Server Error/)
    })

    it("should throw when folder response is missing an id", async () => {
      mockApiClient.get.mockResolvedValueOnce(Right({}))

      await expect(readNotebook.call(VALID_ID)).rejects.toThrow(/no notebook id/)
    })

    it("should suggest read_multinote when there are multiple notes", async () => {
      mockApiClient.get.mockResolvedValueOnce(Right(mockNotebook)).mockResolvedValueOnce(Right(mockNotes))

      const result = await readNotebook.call(VALID_ID)

      expect(result).toContain("read_multinote")
      expect(result).toContain('"note-1"')
      expect(result).toContain('"note-2"')
    })
  })

  describe("ReadNote", () => {
    const mockNote = {
      id: "note-123",
      title: "Test Note",
      body: "This is the note body.",
      parent_id: "notebook-456",
      created_time: 1234567890000,
      updated_time: 1234567891000,
      is_todo: false,
      todo_completed: false,
    }

    it("should return the note content with metadata", async () => {
      const mockNotebook = { id: "notebook-456", title: "Test Notebook" }
      mockApiClient.get.mockResolvedValueOnce(Right(mockNote)).mockResolvedValueOnce(Right(mockNotebook))

      const result = await readNote.call(VALID_ID)

      expect(mockApiClient.get).toHaveBeenCalledWith(`/notes/${VALID_ID}`, {
        query: {
          fields: "id,title,body,parent_id,created_time,updated_time,is_todo,todo_completed,todo_due",
        },
      })
      expect(result).toContain(`# Note: "Test Note"`)
      expect(result).toContain("This is the note body.")
      expect(result).toContain("Test Notebook")
    })

    it("should render todo status for todo notes", async () => {
      const todo = { ...mockNote, is_todo: true, todo_completed: false, todo_due: 1234567899000 }
      mockApiClient.get.mockResolvedValueOnce(Right(todo)).mockResolvedValueOnce(Right({ title: "Test Notebook" }))

      const result = await readNote.call(VALID_ID)

      expect(result).toContain("Status: Not completed")
      expect(result).toContain("Due:")
    })

    it("should handle a note with no body", async () => {
      const empty = { ...mockNote, body: "" }
      mockApiClient.get.mockResolvedValueOnce(Right(empty)).mockResolvedValueOnce(Right({ title: "Test Notebook" }))

      const result = await readNote.call(VALID_ID)

      expect(result).toContain("(This note has no content)")
    })

    it("should validate note id format", async () => {
      const result = await readNote.call("short")

      expect(result).toContain("does not appear to be a valid note ID")
      expect(mockApiClient.get).not.toHaveBeenCalled()
    })

    it("should throw with Joplin's error message when the body has an error field", async () => {
      mockApiClient.get.mockResolvedValueOnce(Right({ error: "Not Found" }))

      await expect(readNote.call(VALID_ID)).rejects.toThrow(/Failed to read note .*: Not Found/)
    })

    it("should throw when API responds 404", async () => {
      const error = new Error("Not found")
      ;(error as any).response = { status: 404 }
      mockApiClient.get.mockResolvedValueOnce(Left(error))

      await expect(readNote.call(VALID_ID)).rejects.toThrow(/Note with ID .* not found/)
    })

    it("should throw on generic API error", async () => {
      mockApiClient.get.mockResolvedValueOnce(Left(new Error("Connection refused")))

      await expect(readNote.call(VALID_ID)).rejects.toThrow(/Failed to read note .*: Connection refused/)
    })

    it("should throw when response is missing an id", async () => {
      mockApiClient.get.mockResolvedValueOnce(Right({}))

      await expect(readNote.call(VALID_ID)).rejects.toThrow(/no note id/)
    })

    it("should fall back to 'Unknown notebook' if the parent lookup fails", async () => {
      // The parent-folder lookup error is swallowed silently inside readNote so the
      // note content is still returned — make sure that behavior is preserved.
      mockApiClient.get
        .mockResolvedValueOnce(Right(mockNote))
        .mockResolvedValueOnce(Left(new Error("Parent lookup failed")))

      const result = await readNote.call(VALID_ID)

      expect(result).toContain("Unknown notebook")
      expect(result).toContain("This is the note body.")
    })
  })
})
