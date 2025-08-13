import { describe, it, expect, beforeEach, vi } from "vitest"
import JoplinAPIClient from "../../src/lib/joplin-api-client.js"
import CreateNote from "../../src/lib/tools/create-note.js"
import CreateFolder from "../../src/lib/tools/create-folder.js"

// Mock JoplinAPIClient
const mockApiClient = {
  post: vi.fn(),
  get: vi.fn(),
}

vi.mock("../../src/lib/joplin-api-client.js", () => ({
  default: vi.fn(() => mockApiClient),
}))

describe("Create Tools", () => {
  let createNote: CreateNote
  let createFolder: CreateFolder

  beforeEach(() => {
    vi.clearAllMocks()
    const client = new JoplinAPIClient({ token: "test-token" })
    createNote = new CreateNote(client)
    createFolder = new CreateFolder(client)
  })

  describe("CreateNote", () => {
    it("should create a note with title and body", async () => {
      const mockCreatedNote = {
        id: "note-123",
        title: "Test Note",
        body: "Test content",
        created_time: 1234567890000,
        updated_time: 1234567890000,
        parent_id: null,
        is_todo: false,
      }

      mockApiClient.post.mockResolvedValue(mockCreatedNote)

      const result = await createNote.call({
        title: "Test Note",
        body: "Test content",
      })

      expect(mockApiClient.post).toHaveBeenCalledWith("/notes", {
        title: "Test Note",
        body: "Test content",
      })
      expect(result).toContain("✅ Successfully created note!")
      expect(result).toContain("Test Note")
      expect(result).toContain("note-123")
    })

    it("should create a note in a specific notebook", async () => {
      const mockCreatedNote = {
        id: "note-123",
        title: "Test Note",
        body: "Test content",
        created_time: 1234567890000,
        updated_time: 1234567890000,
        parent_id: "notebook-456",
        is_todo: false,
      }

      const mockNotebook = {
        id: "notebook-456",
        title: "Test Notebook",
      }

      mockApiClient.post.mockResolvedValue(mockCreatedNote)
      mockApiClient.get.mockResolvedValue(mockNotebook)

      const result = await createNote.call({
        title: "Test Note",
        body: "Test content",
        parent_id: "notebook-456",
      })

      expect(mockApiClient.post).toHaveBeenCalledWith("/notes", {
        title: "Test Note",
        body: "Test content",
        parent_id: "notebook-456",
      })
      expect(result).toContain("Test Notebook")
    })

    it("should create a todo note", async () => {
      const mockCreatedNote = {
        id: "note-123",
        title: "Test Todo",
        body: "Todo content",
        created_time: 1234567890000,
        updated_time: 1234567890000,
        parent_id: null,
        is_todo: true,
        todo_completed: false,
      }

      mockApiClient.post.mockResolvedValue(mockCreatedNote)

      const result = await createNote.call({
        title: "Test Todo",
        body: "Todo content",
        is_todo: true,
      })

      expect(mockApiClient.post).toHaveBeenCalledWith("/notes", {
        title: "Test Todo",
        body: "Todo content",
        is_todo: true,
      })
      expect(result).toContain("Type: Todo item")
    })

    it("should validate required fields", async () => {
      const result = await createNote.call({})

      expect(result).toContain("Please provide at least a title, body, or body_html")
      expect(mockApiClient.post).not.toHaveBeenCalled()
    })

    it("should validate parent_id format", async () => {
      const result = await createNote.call({
        title: "Test Note",
        parent_id: "short",
      })

      expect(result).toContain("does not appear to be a valid notebook ID")
      expect(mockApiClient.post).not.toHaveBeenCalled()
    })

    it("should handle API errors", async () => {
      mockApiClient.post.mockRejectedValue(new Error("API Error"))

      const result = await createNote.call({
        title: "Test Note",
      })

      expect(result).toContain("Error creating note")
    })

    it("should handle 404 errors for parent notebook", async () => {
      const error = new Error("Not found")
      ;(error as any).response = { status: 404 }
      mockApiClient.post.mockRejectedValue(error)

      const result = await createNote.call({
        title: "Test Note",
        parent_id: "a1b2c3d4e5f6789012345678901234567890abcd",
      })

      expect(result).toContain("Notebook with ID")
      expect(result).toContain("not found")
    })
  })

  describe("CreateFolder", () => {
    it("should create a folder with title", async () => {
      const mockCreatedFolder = {
        id: "folder-123",
        title: "Test Folder",
        parent_id: null,
        created_time: 1234567890000,
        updated_time: 1234567890000,
      }

      mockApiClient.post.mockResolvedValue(mockCreatedFolder)

      const result = await createFolder.call({
        title: "Test Folder",
      })

      expect(mockApiClient.post).toHaveBeenCalledWith("/folders", {
        title: "Test Folder",
      })
      expect(result).toContain("✅ Successfully created notebook!")
      expect(result).toContain("Test Folder")
      expect(result).toContain("folder-123")
    })

    it("should create a subfolder", async () => {
      const mockCreatedFolder = {
        id: "folder-123",
        title: "Test Subfolder",
        parent_id: "parent-456",
        created_time: 1234567890000,
        updated_time: 1234567890000,
      }

      const mockParentFolder = {
        id: "parent-456",
        title: "Parent Folder",
      }

      mockApiClient.post.mockResolvedValue(mockCreatedFolder)
      mockApiClient.get.mockResolvedValue(mockParentFolder)

      const result = await createFolder.call({
        title: "Test Subfolder",
        parent_id: "parent-456",
      })

      expect(mockApiClient.post).toHaveBeenCalledWith("/folders", {
        title: "Test Subfolder",
        parent_id: "parent-456",
      })
      expect(result).toContain("Parent Folder")
    })

    it("should validate required title", async () => {
      const result = await createFolder.call({} as any)

      expect(result).toContain("Please provide a title")
      expect(mockApiClient.post).not.toHaveBeenCalled()
    })

    it("should validate empty title", async () => {
      const result = await createFolder.call({
        title: "   ",
      })

      expect(result).toContain("Please provide a title")
      expect(mockApiClient.post).not.toHaveBeenCalled()
    })

    it("should validate parent_id format", async () => {
      const result = await createFolder.call({
        title: "Test Folder",
        parent_id: "short",
      })

      expect(result).toContain("does not appear to be a valid parent notebook ID")
      expect(mockApiClient.post).not.toHaveBeenCalled()
    })

    it("should handle API errors", async () => {
      mockApiClient.post.mockRejectedValue(new Error("API Error"))

      const result = await createFolder.call({
        title: "Test Folder",
      })

      expect(result).toContain("Error creating notebook")
    })

    it("should handle 404 errors for parent folder", async () => {
      const error = new Error("Not found")
      ;(error as any).response = { status: 404 }
      mockApiClient.post.mockRejectedValue(error)

      const result = await createFolder.call({
        title: "Test Folder",
        parent_id: "a1b2c3d4e5f6789012345678901234567890abcd",
      })

      expect(result).toContain("Parent notebook with ID")
      expect(result).toContain("not found")
    })

    it("should handle 409 conflict errors", async () => {
      const error = new Error("Conflict")
      ;(error as any).response = { status: 409 }
      mockApiClient.post.mockRejectedValue(error)

      const result = await createFolder.call({
        title: "Existing Folder",
      })

      expect(result).toContain('notebook with the title "Existing Folder" might already exist')
    })
  })
})
