import type { JoplinFolder, JoplinNote } from "./base-tool.js"
import BaseTool, { extractJoplinErrorMessage, ToolError } from "./base-tool.js"

type NotebookNotesResponse = {
  items: JoplinNote[]
}

class ReadNotebook extends BaseTool {
  async call(notebookId: string): Promise<string> {
    const validationError = this.validateId(notebookId, "notebook")
    if (validationError) {
      return validationError
    }

    try {
      // First, get the notebook details
      const notebook = this.unwrap(
        await this.apiClient.get<JoplinFolder>(`/folders/${notebookId}`, {
          query: { fields: "id,title,parent_id" },
        }),
      )

      const notebookLoadError = extractJoplinErrorMessage(notebook)
      if (notebookLoadError !== undefined) {
        throw new ToolError(`Failed to read notebook "${notebookId}": ${notebookLoadError}`)
      }
      if (!notebook || typeof notebook !== "object" || !notebook.id) {
        throw new ToolError(
          `Failed to read notebook "${notebookId}": Joplin API returned an unexpected response (no notebook id). Raw response: ${JSON.stringify(notebook)}`,
        )
      }

      // Get all notes in this notebook
      const notes = this.unwrap(
        await this.apiClient.get<NotebookNotesResponse>(`/folders/${notebookId}/notes`, {
          query: { fields: "id,title,updated_time,is_todo,todo_completed" },
        }),
      )

      const notesLoadError = extractJoplinErrorMessage(notes)
      if (notesLoadError !== undefined) {
        throw new ToolError(`Failed to load notes for notebook "${notebookId}": ${notesLoadError}`)
      }
      if (!notes || typeof notes !== "object") {
        throw new ToolError(
          `Failed to load notes for notebook "${notebookId}": Joplin API returned an unexpected response. Raw response: ${JSON.stringify(notes)}`,
        )
      }

      if (!notes.items || !Array.isArray(notes.items) || notes.items.length === 0) {
        return `Notebook "${notebook.title}" (notebook_id: "${notebook.id}") is empty.\n\nTry another notebook ID or use list_notebooks to see all available notebooks.`
      }

      // Format the notebook contents
      const resultLines: string[] = []
      resultLines.push(`# Notebook: "${notebook.title}" (notebook_id: "${notebook.id}")`)
      resultLines.push(`Contains ${notes.items.length} notes:\n`)
      resultLines.push(`NOTE: This is showing the contents of notebook "${notebook.title}", not a specific note.\n`)

      // If multiple notes were found, add a hint about read_multinote
      if (notes.items.length > 1) {
        const noteIds = notes.items.map((note) => note.id)
        resultLines.push(`TIP: To read all ${notes.items.length} notes at once, use:\n`)
        resultLines.push(`read_multinote note_ids=${JSON.stringify(noteIds)}\n`)
      }

      // Sort notes by updated_time (newest first)
      const sortedNotes = [...notes.items].sort((a, b) => b.updated_time - a.updated_time)

      sortedNotes.forEach((note) => {
        const updatedDate = this.formatDate(note.updated_time)

        // Add checkbox for todos
        if (note.is_todo) {
          const checkboxStatus = note.todo_completed ? "✅" : "☐"
          resultLines.push(`- ${checkboxStatus} Note: "${note.title}" (note_id: "${note.id}")`)
        } else {
          resultLines.push(`- Note: "${note.title}" (note_id: "${note.id}")`)
        }

        resultLines.push(`  Updated: ${updatedDate}`)
        resultLines.push(`  To read this note: read_note note_id="${note.id}"`)
        resultLines.push("") // Empty line between notes
      })

      return resultLines.join("\n")
    } catch (error: unknown) {
      if (error instanceof ToolError) throw error

      const err = error as { response?: { status?: number } }
      process.stderr.write(`reading notebook error: ${error}\n`)
      if (err.response?.status === 404) {
        throw new ToolError(
          `Notebook with ID "${notebookId}" not found. This might happen if the ID is incorrect, you're using a note title instead of a notebook ID, or the notebook has been deleted. Use list_notebooks to see all available notebooks with their IDs.`,
        )
      }
      const message = error instanceof Error ? error.message : "Unknown error"
      throw new ToolError(
        `Failed to read notebook "${notebookId}": ${message}. Make sure you're using a valid notebook ID, not a note title. Use list_notebooks to see all available notebooks with their IDs.`,
      )
    }
  }
}

export default ReadNotebook
