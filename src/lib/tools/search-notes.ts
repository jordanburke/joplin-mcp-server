import type { JoplinFolder, JoplinNote } from "./base-tool.js"
import BaseTool, { ToolError } from "./base-tool.js"

type SearchResult = {
  items: JoplinNote[]
}

class SearchNotes extends BaseTool {
  async call(query: string): Promise<string> {
    if (!query) {
      return "Please provide a search query."
    }

    try {
      // Search for notes with the given query
      const searchResults = this.unwrap(
        await this.apiClient.get<SearchResult>("/search", {
          query: {
            query,
            fields: "id,title,body,parent_id,updated_time",
          },
        }),
      )

      // Handle case where the API doesn't return the expected structure
      if (!searchResults || typeof searchResults !== "object") {
        return `Error: Unexpected response format from Joplin API`
      }

      // Handle case where no items were found
      if (!searchResults.items || !Array.isArray(searchResults.items) || searchResults.items.length === 0) {
        return `No notes found matching query: "${query}"`
      }

      // Get all folders to be able to show notebook names
      const folders = this.unwrap(
        await this.apiClient.getAllItems<JoplinFolder>("/folders", {
          query: {
            fields: "id,title",
          },
        }),
      )

      // Create a map of folder IDs to folder titles for quick lookup
      const folderMap: Record<string, string> = {}
      folders.forEach((folder) => {
        folderMap[folder.id] = folder.title
      })

      // Format the search results
      const resultLines: string[] = []
      resultLines.push(`Found ${searchResults.items.length} notes matching query: "${query}"\n`)
      resultLines.push(`NOTE: To read a notebook, use the notebook ID (not the note title)\n`)

      // If multiple notes were found, add a hint about read_multinote
      if (searchResults.items.length > 1) {
        const noteIds = searchResults.items.map((note) => note.id)
        resultLines.push(`TIP: To read all ${searchResults.items.length} notes at once, use:\n`)
        resultLines.push(`read_multinote note_ids=${JSON.stringify(noteIds)}\n`)
      }

      resultLines.push(
        ...searchResults.items.flatMap((note) => {
          const notebookTitle = folderMap[note.parent_id ?? ""] ?? "Unknown notebook"
          const notebookId = note.parent_id ?? "unknown"
          // Add a snippet of the note body if available
          const snippet = note.body
            ? [`  Snippet: ${note.body.substring(0, 100).replace(/\n/g, " ") + (note.body.length > 100 ? "..." : "")}`]
            : []
          return [
            `- Note: "${note.title}" (note_id: "${note.id}")`,
            `  Notebook: "${notebookTitle}" (notebook_id: "${notebookId}")`,
            `  Updated: ${this.formatDate(note.updated_time)}`,
            ...snippet,
            // Add hints for using related commands
            `  To read this note: read_note note_id="${note.id}"`,
            `  To read this notebook: read_notebook notebook_id="${notebookId}"`,
            "", // Empty line between notes
          ]
        }),
      )

      return resultLines.join("\n")
    } catch (error: unknown) {
      if (error instanceof ToolError) throw error
      process.stderr.write(`searching notes error: ${error}\n`)
      const message = error instanceof Error ? error.message : "Unknown error"
      throw new ToolError(`Failed to search notes: ${message}`)
    }
  }
}

export default SearchNotes
