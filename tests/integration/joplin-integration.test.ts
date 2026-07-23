import { describe, it, expect, beforeAll } from "vitest"
import { Either } from "functype"
import JoplinAPIClient from "../../src/lib/joplin-api-client.js"
import { ListNotebooks, SearchNotes, ReadNotebook } from "../../src/lib/tools/index.js"

describe("Joplin Integration Tests", () => {
  let client: JoplinAPIClient
  let skipTests = false

  beforeAll(async () => {
    // Check if we have the required environment variables for integration tests
    if (!process.env.JOPLIN_TOKEN || !process.env.JOPLIN_PORT) {
      console.warn("Skipping integration tests: JOPLIN_TOKEN or JOPLIN_PORT not set")
      skipTests = true
      return
    }

    client = new JoplinAPIClient({
      port: parseInt(process.env.JOPLIN_PORT),
      token: process.env.JOPLIN_TOKEN,
    })

    // Check if Joplin is actually running and accessible
    const result = await client.serviceAvailable()
    if (Either.isLeft(result)) {
      console.warn("Skipping integration tests: Joplin service not available")
      skipTests = true
      return
    }

    // /ping is unauthenticated, so a reachable server says nothing about whether
    // our token is accepted. Probe an authenticated endpoint before running.
    const authorized = await client.get("/folders", { query: { limit: 1 } })
    if (Either.isLeft(authorized)) {
      console.warn("Skipping integration tests: Joplin rejected the configured JOPLIN_TOKEN")
      skipTests = true
    }
  })

  describe("Joplin API Client Integration", () => {
    it("should connect to Joplin service", async () => {
      if (skipTests) return

      const result = await client.serviceAvailable()
      expect(Either.isRight(result)).toBe(true)
    })

    it("should fetch folders from Joplin", async () => {
      if (skipTests) return

      const result = await client.get<{ items: unknown[]; has_more: boolean }>("/folders", {
        query: { limit: 5, fields: "id,title,parent_id" },
      })

      expect(Either.isRight(result)).toBe(true)
      const folders = result.fold(
        () => null,
        (v) => v,
      )
      expect(folders).toHaveProperty("items")
      expect(Array.isArray(folders!.items)).toBe(true)
      expect(folders).toHaveProperty("has_more")
    })

    it("should fetch notes from Joplin", async () => {
      if (skipTests) return

      const result = await client.get<{ items: unknown[]; has_more: boolean }>("/notes", {
        query: { limit: 5, fields: "id,title,parent_id" },
      })

      expect(Either.isRight(result)).toBe(true)
      const notes = result.fold(
        () => null,
        (v) => v,
      )
      expect(notes).toHaveProperty("items")
      expect(Array.isArray(notes!.items)).toBe(true)
    })
  })

  describe("Tools Integration", () => {
    it("should list notebooks using ListNotebooks tool", async () => {
      if (skipTests) return

      const tool = new ListNotebooks(client)
      const result = await tool.call()

      expect(typeof result).toBe("string")
      expect(result).toContain("Joplin Notebooks:")
      expect(result).toContain("notebook_id:")
    })

    it("should search notes using SearchNotes tool", async () => {
      if (skipTests) return

      // First, let's check if there are any notes to search
      const notesResult = await client.get<{ items: { id: string }[] }>("/notes", { query: { limit: 1 } })
      const notes = notesResult.fold(
        () => ({ items: [] }),
        (v) => v,
      )
      if (notes.items.length === 0) {
        console.warn("Skipping search test: No notes found in Joplin")
        return
      }

      const tool = new SearchNotes(client)
      const result = await tool.call("test")

      expect(typeof result).toBe("string")
      // The result should either contain matching notes or indicate no matches
      expect(result).toMatch(/(Found \d+ notes|No notes found)/)
    })

    it("should read a notebook using ReadNotebook tool", async () => {
      if (skipTests) return

      // First get a notebook ID
      const foldersResult = await client.get<{ items: { id: string; title: string }[] }>("/folders", {
        query: { limit: 1, fields: "id,title" },
      })

      const folders = foldersResult.fold(
        () => ({ items: [] as { id: string; title: string }[] }),
        (v) => v,
      )

      if (folders.items.length === 0) {
        console.warn("Skipping read notebook test: No notebooks found")
        return
      }

      const notebookId = folders.items[0].id
      const tool = new ReadNotebook(client)
      const result = await tool.call(notebookId)

      expect(typeof result).toBe("string")
      expect(result).toContain("Notebook:")
      expect(result).toContain(notebookId)
    })
  })

  describe("Error Handling", () => {
    it("should handle invalid API calls gracefully", async () => {
      if (skipTests) return

      const result = await client.get("/invalid-endpoint")
      expect(Either.isLeft(result)).toBe(true)
    })

    it("should throw on invalid notebook ID in ReadNotebook tool", async () => {
      if (skipTests) return

      const tool = new ReadNotebook(client)
      await expect(tool.call("invalid-notebook-id")).rejects.toThrow(/not found/)
    })
  })
})
