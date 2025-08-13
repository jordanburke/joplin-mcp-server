import { describe, it, expect, beforeEach, vi } from "vitest"
import JoplinAPIClient from "../../src/lib/joplin-api-client.js"
import EditNote from "../../src/lib/tools/edit-note.js"
import EditFolder from "../../src/lib/tools/edit-folder.js"

// Mock JoplinAPIClient
const mockApiClient = {
  get: vi.fn(),
  put: vi.fn(),
}

vi.mock("../../src/lib/joplin-api-client.js", () => ({
  default: vi.fn(() => mockApiClient),
}))

describe("Edit Tools", () => {
  let editNote: EditNote
  let editFolder: EditFolder

  beforeEach(() => {
    vi.clearAllMocks()
    const client = new JoplinAPIClient({ token: "test-token" })
    editNote = new EditNote(client)
    editFolder = new EditFolder(client)
  })

  describe("EditNote", () => {
    const mockCurrentNote = {
      id: "note-123",
      title: "Original Title",
      body: "Original content",
      parent_id: null,
      is_todo: false,
      todo_completed: false,
      updated_time: 1234567890000,
    }

    const mockUpdatedNote = {
      id: "note-123",
      title: "Updated Title",
      body: "Updated content",
      parent_id: null,
      is_todo: false,
      todo_completed: false,
      updated_time: 1234567891000,
    }

    it("should update note title", async () => {
      mockApiClient.get.mockResolvedValue(mockCurrentNote)
      mockApiClient.put.mockResolvedValue(mockUpdatedNote)

      const result = await editNote.call({
        note_id: "a1b2c3d4e5f6789012345678901234567890abcd",
        title: "Updated Title",
      })

      expect(mockApiClient.get).toHaveBeenCalledWith("/notes/a1b2c3d4e5f6789012345678901234567890abcd", {
        query: { fields: "id,title,body,parent_id,is_todo,todo_completed,todo_due,updated_time" },
      })
      expect(mockApiClient.put).toHaveBeenCalledWith("/notes/a1b2c3d4e5f6789012345678901234567890abcd", {
        title: "Updated Title",
      })
      expect(result).toContain("✅ Successfully updated note!")
      expect(result).toContain('Title: "Original Title" → "Updated Title"')
    })

    it("should update note body", async () => {
      const updatedNote = { ...mockCurrentNote, body: "New content", updated_time: 1234567891000 }
      mockApiClient.get.mockResolvedValue(mockCurrentNote)
      mockApiClient.put.mockResolvedValue(updatedNote)

      const result = await editNote.call({
        note_id: "a1b2c3d4e5f6789012345678901234567890abcd",
        body: "New content",
      })

      expect(mockApiClient.put).toHaveBeenCalledWith("/notes/a1b2c3d4e5f6789012345678901234567890abcd", {
        body: "New content",
      })
      expect(result).toContain("Content: Updated")
    })

    it("should convert note to todo", async () => {
      const updatedNote = { ...mockCurrentNote, is_todo: true, updated_time: 1234567891000 }
      mockApiClient.get.mockResolvedValue(mockCurrentNote)
      mockApiClient.put.mockResolvedValue(updatedNote)

      const result = await editNote.call({
        note_id: "a1b2c3d4e5f6789012345678901234567890abcd",
        is_todo: true,
      })

      expect(mockApiClient.put).toHaveBeenCalledWith("/notes/a1b2c3d4e5f6789012345678901234567890abcd", {
        is_todo: true,
      })
      expect(result).toContain("Type: Regular note → Todo")
    })

    it("should mark todo as completed", async () => {
      const currentTodo = { ...mockCurrentNote, is_todo: true, todo_completed: false }
      const updatedTodo = { ...currentTodo, todo_completed: true, updated_time: 1234567891000 }
      mockApiClient.get.mockResolvedValue(currentTodo)
      mockApiClient.put.mockResolvedValue(updatedTodo)

      const result = await editNote.call({
        note_id: "a1b2c3d4e5f6789012345678901234567890abcd",
        todo_completed: true,
      })

      expect(mockApiClient.put).toHaveBeenCalledWith("/notes/a1b2c3d4e5f6789012345678901234567890abcd", {
        todo_completed: true,
      })
      expect(result).toContain("Todo Status: Not completed → Completed")
    })

    it("should move note to different notebook", async () => {
      const updatedNote = {
        ...mockCurrentNote,
        parent_id: "a1b2c3d4e5f6789012345678901234567890abce",
        updated_time: 1234567891000,
      }
      const mockNotebook = { title: "New Notebook" }

      mockApiClient.get.mockResolvedValueOnce(mockCurrentNote).mockResolvedValueOnce(mockNotebook)
      mockApiClient.put.mockResolvedValue(updatedNote)

      const result = await editNote.call({
        note_id: "a1b2c3d4e5f6789012345678901234567890abcd",
        parent_id: "a1b2c3d4e5f6789012345678901234567890abce",
      })

      expect(mockApiClient.put).toHaveBeenCalledWith("/notes/a1b2c3d4e5f6789012345678901234567890abcd", {
        parent_id: "a1b2c3d4e5f6789012345678901234567890abce",
      })
      expect(result).toContain('Location: Root level → "New Notebook"')
    })

    it("should validate required note_id", async () => {
      const result = await editNote.call({} as any)

      expect(result).toContain("Please provide note edit options")
      expect(mockApiClient.get).not.toHaveBeenCalled()
    })

    it("should validate note_id format", async () => {
      const result = await editNote.call({
        note_id: "short",
        title: "New Title",
      })

      expect(result).toContain("does not appear to be a valid note ID")
      expect(mockApiClient.get).not.toHaveBeenCalled()
    })

    it("should require at least one update field", async () => {
      const result = await editNote.call({
        note_id: "a1b2c3d4e5f6789012345678901234567890abcd",
      })

      expect(result).toContain("Please provide at least one field to update")
      expect(mockApiClient.get).not.toHaveBeenCalled()
    })

    it("should handle note not found", async () => {
      mockApiClient.get.mockResolvedValue(null)

      const result = await editNote.call({
        note_id: "a1b2c3d4e5f6789012345678901234567890abcd",
        title: "New Title",
      })

      expect(result).toContain("Note with ID")
      expect(result).toContain("not found")
    })

    it("should validate parent_id format", async () => {
      const result = await editNote.call({
        note_id: "a1b2c3d4e5f6789012345678901234567890abcd",
        parent_id: "short",
      })

      expect(result).toContain("does not appear to be a valid notebook ID")
      expect(mockApiClient.get).not.toHaveBeenCalled()
    })
  })

  describe("EditFolder", () => {
    const mockCurrentFolder = {
      id: "folder-123",
      title: "Original Folder",
      parent_id: null,
    }

    const mockUpdatedFolder = {
      id: "folder-123",
      title: "Updated Folder",
      parent_id: null,
      updated_time: 1234567891000,
    }

    it("should update folder title", async () => {
      mockApiClient.get.mockResolvedValue(mockCurrentFolder)
      mockApiClient.put.mockResolvedValue(mockUpdatedFolder)

      const result = await editFolder.call({
        folder_id: "folder-123",
        title: "Updated Folder",
      })

      expect(mockApiClient.get).toHaveBeenCalledWith("/folders/folder-123", {
        query: { fields: "id,title,parent_id" },
      })
      expect(mockApiClient.put).toHaveBeenCalledWith("/folders/folder-123", {
        title: "Updated Folder",
      })
      expect(result).toContain("✅ Successfully updated notebook!")
      expect(result).toContain('Title: "Original Folder" → "Updated Folder"')
    })

    it("should move folder to different parent", async () => {
      const updatedFolder = { ...mockCurrentFolder, parent_id: "parent-456", updated_time: 1234567891000 }
      const mockParent = { title: "Parent Folder" }

      mockApiClient.get.mockResolvedValueOnce(mockCurrentFolder).mockResolvedValueOnce(mockParent)
      mockApiClient.put.mockResolvedValue(updatedFolder)

      const result = await editFolder.call({
        folder_id: "folder-123",
        parent_id: "parent-456",
      })

      expect(mockApiClient.put).toHaveBeenCalledWith("/folders/folder-123", {
        parent_id: "parent-456",
      })
      expect(result).toContain('Location: Top level → Inside "Parent Folder"')
    })

    it("should validate required folder_id", async () => {
      const result = await editFolder.call({} as any)

      expect(result).toContain("Please provide folder edit options")
      expect(mockApiClient.get).not.toHaveBeenCalled()
    })

    it("should validate folder_id format", async () => {
      const result = await editFolder.call({
        folder_id: "short",
        title: "New Title",
      })

      expect(result).toContain("does not appear to be a valid folder ID")
      expect(mockApiClient.get).not.toHaveBeenCalled()
    })

    it("should require at least one update field", async () => {
      const result = await editFolder.call({
        folder_id: "a1b2c3d4e5f6789012345678901234567890abcd",
      })

      expect(result).toContain("Please provide at least one field to update")
      expect(mockApiClient.get).not.toHaveBeenCalled()
    })

    it("should validate empty title", async () => {
      const result = await editFolder.call({
        folder_id: "a1b2c3d4e5f6789012345678901234567890abcd",
        title: "   ",
      })

      expect(result).toContain("Title must be a non-empty string")
      expect(mockApiClient.get).not.toHaveBeenCalled()
    })

    it("should prevent self-parenting", async () => {
      const result = await editFolder.call({
        folder_id: "a1b2c3d4e5f6789012345678901234567890abcd",
        parent_id: "a1b2c3d4e5f6789012345678901234567890abcd",
      })

      expect(result).toContain("A folder cannot be its own parent")
      expect(mockApiClient.get).not.toHaveBeenCalled()
    })

    it("should handle folder not found", async () => {
      mockApiClient.get.mockResolvedValue(null)

      const result = await editFolder.call({
        folder_id: "a1b2c3d4e5f6789012345678901234567890abcd",
        title: "New Title",
      })

      expect(result).toContain("Folder with ID")
      expect(result).toContain("not found")
    })

    it("should validate parent_id format", async () => {
      const result = await editFolder.call({
        folder_id: "a1b2c3d4e5f6789012345678901234567890abcd",
        parent_id: "short",
      })

      expect(result).toContain("does not appear to be a valid parent notebook ID")
      expect(mockApiClient.get).not.toHaveBeenCalled()
    })

    it("should handle 409 conflict errors", async () => {
      const error = new Error("Conflict")
      ;(error as any).response = { status: 409 }
      mockApiClient.get.mockResolvedValue(mockCurrentFolder)
      mockApiClient.put.mockRejectedValue(error)

      const result = await editFolder.call({
        folder_id: "folder-123",
        title: "Existing Name",
      })

      expect(result).toContain('folder with the title "Existing Name" might already exist')
    })
  })
})
