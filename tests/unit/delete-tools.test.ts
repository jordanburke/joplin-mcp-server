import { describe, it, expect, beforeEach, vi } from "vitest"
import JoplinAPIClient from "../../src/lib/joplin-api-client.js"
import DeleteNote from "../../src/lib/tools/delete-note.js"
import DeleteFolder from "../../src/lib/tools/delete-folder.js"

// Mock JoplinAPIClient
const mockApiClient = {
  get: vi.fn(),
  delete: vi.fn(),
}

vi.mock("../../src/lib/joplin-api-client.js", function () {
  return {
    default: vi.fn(function () {
      return mockApiClient
    }),
  }
})

describe("Delete Tools", () => {
  let deleteNote: DeleteNote
  let deleteFolder: DeleteFolder

  beforeEach(() => {
    vi.clearAllMocks()
    const client = new JoplinAPIClient({ token: "test-token" })
    deleteNote = new DeleteNote(client)
    deleteFolder = new DeleteFolder(client)
  })

  describe("DeleteNote", () => {
    const mockNote = {
      id: "note-123",
      title: "Test Note",
      body: "This is a test note content",
      parent_id: "notebook-456",
      is_todo: false,
      todo_completed: false,
      created_time: 1234567890000,
      updated_time: 1234567891000,
    }

    it("should require confirmation before deleting", async () => {
      const result = await deleteNote.call({
        note_id: "a1b2c3d4e5f6789012345678901234567890abcd",
      })

      expect(result).toContain("This will permanently delete the note!")
      expect(result).toContain('"confirm": true')
      expect(mockApiClient.get).not.toHaveBeenCalled()
      expect(mockApiClient.delete).not.toHaveBeenCalled()
    })

    it("should delete note with confirmation", async () => {
      const mockNotebook = { title: "Test Notebook" }
      mockApiClient.get.mockResolvedValueOnce(mockNote).mockResolvedValueOnce(mockNotebook)
      mockApiClient.delete.mockResolvedValue({})

      const result = await deleteNote.call({
        note_id: "a1b2c3d4e5f6789012345678901234567890abcd",
        confirm: true,
      })

      expect(mockApiClient.get).toHaveBeenCalledWith("/notes/a1b2c3d4e5f6789012345678901234567890abcd", {
        query: { fields: "id,title,body,parent_id,is_todo,todo_completed,created_time,updated_time" },
      })
      expect(mockApiClient.delete).toHaveBeenCalledWith("/notes/a1b2c3d4e5f6789012345678901234567890abcd")
      expect(result).toContain("🗑️  Successfully deleted note!")
      expect(result).toContain("Test Note")
      expect(result).toContain("Test Notebook")
    })

    it("should delete todo note with status", async () => {
      const mockTodo = { ...mockNote, is_todo: true, todo_completed: true }
      mockApiClient.get.mockResolvedValue(mockTodo)
      mockApiClient.delete.mockResolvedValue({})

      const result = await deleteNote.call({
        note_id: "a1b2c3d4e5f6789012345678901234567890abcd",
        confirm: true,
      })

      expect(result).toContain("Type: Todo (Completed)")
    })

    it("should handle note not found", async () => {
      mockApiClient.get.mockResolvedValue(null)

      const result = await deleteNote.call({
        note_id: "a1b2c3d4e5f6789012345678901234567890abcd",
        confirm: true,
      })

      expect(result).toContain("Note with ID")
      expect(result).toContain("not found")
      expect(mockApiClient.delete).not.toHaveBeenCalled()
    })

    it("should validate note_id format", async () => {
      const result = await deleteNote.call({
        note_id: "short",
        confirm: true,
      })

      expect(result).toContain("does not appear to be a valid note ID")
      expect(mockApiClient.get).not.toHaveBeenCalled()
    })

    it("should handle API errors", async () => {
      mockApiClient.get.mockResolvedValue(mockNote)
      mockApiClient.delete.mockRejectedValue(new Error("API Error"))

      const result = await deleteNote.call({
        note_id: "a1b2c3d4e5f6789012345678901234567890abcd",
        confirm: true,
      })

      expect(result).toContain("Error deleting note")
    })

    it("should handle 404 errors on delete", async () => {
      mockApiClient.get.mockResolvedValue(mockNote)
      const error = new Error("Not found")
      ;(error as any).response = { status: 404 }
      mockApiClient.delete.mockRejectedValue(error)

      const result = await deleteNote.call({
        note_id: "a1b2c3d4e5f6789012345678901234567890abcd",
        confirm: true,
      })

      expect(result).toContain("Note with ID")
      expect(result).toContain("not found")
    })
  })

  describe("DeleteFolder", () => {
    const mockFolder = {
      id: "folder-123",
      title: "Test Folder",
      parent_id: "parent-456",
    }

    it("should require confirmation before deleting", async () => {
      const result = await deleteFolder.call({
        folder_id: "a1b2c3d4e5f6789012345678901234567890abcd",
      })

      expect(result).toContain("This will permanently delete the notebook/folder!")
      expect(result).toContain('"confirm": true')
      expect(mockApiClient.get).not.toHaveBeenCalled()
      expect(mockApiClient.delete).not.toHaveBeenCalled()
    })

    it("should delete empty folder with confirmation", async () => {
      const mockParent = { title: "Parent Folder" }
      mockApiClient.get
        .mockResolvedValueOnce(mockFolder)
        .mockResolvedValueOnce({ items: [] }) // notes
        .mockResolvedValueOnce({ items: [] }) // subfolders
        .mockResolvedValueOnce(mockParent)
      mockApiClient.delete.mockResolvedValue({})

      const result = await deleteFolder.call({
        folder_id: "a1b2c3d4e5f6789012345678901234567890abcd",
        confirm: true,
      })

      expect(mockApiClient.delete).toHaveBeenCalledWith("/folders/a1b2c3d4e5f6789012345678901234567890abcd")
      expect(result).toContain("🗑️  Successfully deleted notebook!")
      expect(result).toContain("Test Folder")
      expect(result).toContain("Parent Folder")
    })

    it("should warn about non-empty folder without force", async () => {
      const mockNotes = { items: [{ id: "note1", title: "Note 1" }] }
      const mockSubfolders = { items: [{ id: "sub1", title: "Subfolder 1" }] }

      mockApiClient.get
        .mockResolvedValueOnce(mockFolder)
        .mockResolvedValueOnce(mockNotes)
        .mockResolvedValueOnce({ items: mockSubfolders.items })

      const result = await deleteFolder.call({
        folder_id: "a1b2c3d4e5f6789012345678901234567890abcd",
        confirm: true,
      })

      expect(result).toContain("Cannot delete non-empty notebook!")
      expect(result).toContain("Contains: 1 notes and 0 subfolders")
      expect(result).toContain("Force delete")
      expect(mockApiClient.delete).not.toHaveBeenCalled()
    })

    it("should force delete non-empty folder when requested", async () => {
      const mockNotes = { items: [{ id: "note1", title: "Note 1" }] }
      const mockSubfolders = { items: [] }

      mockApiClient.get
        .mockResolvedValueOnce(mockFolder)
        .mockResolvedValueOnce(mockNotes)
        .mockResolvedValueOnce({ items: mockSubfolders.items })
      mockApiClient.delete.mockResolvedValue({})

      const result = await deleteFolder.call({
        folder_id: "a1b2c3d4e5f6789012345678901234567890abcd",
        confirm: true,
        force: true,
      })

      expect(mockApiClient.delete).toHaveBeenCalledWith("/folders/a1b2c3d4e5f6789012345678901234567890abcd")
      expect(result).toContain("🗑️  Successfully deleted notebook!")
      expect(result).toContain("Deleted Content: 1 notes and 0 subfolders")
    })

    it("should handle folder not found", async () => {
      mockApiClient.get.mockResolvedValue(null)

      const result = await deleteFolder.call({
        folder_id: "a1b2c3d4e5f6789012345678901234567890abcd",
        confirm: true,
      })

      expect(result).toContain("Folder with ID")
      expect(result).toContain("not found")
      expect(mockApiClient.delete).not.toHaveBeenCalled()
    })

    it("should validate folder_id format", async () => {
      const result = await deleteFolder.call({
        folder_id: "short",
        confirm: true,
      })

      expect(result).toContain("does not appear to be a valid folder ID")
      expect(mockApiClient.get).not.toHaveBeenCalled()
    })

    it("should handle API errors", async () => {
      mockApiClient.get
        .mockResolvedValueOnce(mockFolder)
        .mockResolvedValueOnce({ items: [] })
        .mockResolvedValueOnce({ items: [] })
      mockApiClient.delete.mockRejectedValue(new Error("API Error"))

      const result = await deleteFolder.call({
        folder_id: "a1b2c3d4e5f6789012345678901234567890abcd",
        confirm: true,
      })

      expect(result).toContain("Error deleting folder")
    })

    it("should handle 409 conflict errors", async () => {
      mockApiClient.get
        .mockResolvedValueOnce(mockFolder)
        .mockResolvedValueOnce({ items: [] })
        .mockResolvedValueOnce({ items: [] })
      const error = new Error("Conflict")
      ;(error as any).response = { status: 409 }
      mockApiClient.delete.mockRejectedValue(error)

      const result = await deleteFolder.call({
        folder_id: "a1b2c3d4e5f6789012345678901234567890abcd",
        confirm: true,
      })

      expect(result).toContain("Cannot delete folder")
      expect(result).toContain("may contain items that prevent deletion")
    })

    it("should validate required parameters", async () => {
      const result = await deleteFolder.call({} as any)

      expect(result).toContain("Please provide folder deletion options")
      expect(mockApiClient.get).not.toHaveBeenCalled()
    })
  })
})
