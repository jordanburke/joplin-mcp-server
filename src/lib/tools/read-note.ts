import type { JoplinFolder, JoplinNote } from "./base-tool.js"
import BaseTool, { extractJoplinErrorMessage, ToolError } from "./base-tool.js"

class ReadNote extends BaseTool {
  async call(noteId: string): Promise<string> {
    const validationError = this.validateId(noteId, "note")
    if (validationError) {
      return validationError
    }

    try {
      // Get the note details with all relevant fields
      const note = this.unwrap(
        await this.apiClient.get<JoplinNote>(`/notes/${noteId}`, {
          query: {
            fields: "id,title,body,parent_id,created_time,updated_time,is_todo,todo_completed,todo_due",
          },
        }),
      )

      const noteLoadError = extractJoplinErrorMessage(note)
      if (noteLoadError !== undefined) {
        throw new ToolError(`Failed to read note "${noteId}": ${noteLoadError}`)
      }
      if (!note || typeof note !== "object" || !note.id) {
        throw new ToolError(
          `Failed to read note "${noteId}": Joplin API returned an unexpected response (no note id). Raw response: ${JSON.stringify(note)}`,
        )
      }

      // Get the notebook info to show where this note is located
      const notebookInfo = await (async (): Promise<string> => {
        if (!note.parent_id) return "Unknown notebook"
        try {
          const notebook = this.unwrap(
            await this.apiClient.get<JoplinFolder>(`/folders/${note.parent_id}`, {
              query: { fields: "id,title" },
            }),
          )
          if (notebook?.title) {
            return `"${notebook.title}" (notebook_id: "${note.parent_id}")`
          }
          return "Unknown notebook"
        } catch (err: unknown) {
          process.stderr.write(`Error fetching notebook info: ${err}\n`)
          return "Unknown notebook"
        }
      })()

      // Format the note content
      const resultLines: string[] = []

      // Add note header with metadata
      resultLines.push(`# Note: "${note.title}"`)
      resultLines.push(`Note ID: ${note.id}`)
      resultLines.push(`Notebook: ${notebookInfo}`)

      // Add todo status if applicable
      if (note.is_todo) {
        const status = note.todo_completed ? "Completed" : "Not completed"
        resultLines.push(`Status: ${status}`)

        if (note.todo_due) {
          const dueDate = this.formatDate(note.todo_due)
          resultLines.push(`Due: ${dueDate}`)
        }
      }

      // Add timestamps
      const createdDate = this.formatDate(note.created_time)
      const updatedDate = this.formatDate(note.updated_time)
      resultLines.push(`Created: ${createdDate}`)
      resultLines.push(`Updated: ${updatedDate}`)

      // Add a separator before the note content
      resultLines.push("\n---\n")

      // Add the note body
      if (note.body) {
        resultLines.push(note.body)
      } else {
        resultLines.push("(This note has no content)")
      }

      // Add a footer with helpful commands
      resultLines.push("\n---\n")
      resultLines.push("Related commands:")
      resultLines.push(`- To view the notebook containing this note: read_notebook notebook_id="${note.parent_id}"`)
      resultLines.push('- To search for more notes: search_notes query="your search term"')

      return resultLines.join("\n")
    } catch (error: unknown) {
      if (error instanceof ToolError) throw error

      const err = error as { response?: { status?: number } }
      process.stderr.write(`reading note error: ${error}\n`)
      if (err.response?.status === 404) {
        throw new ToolError(
          `Note with ID "${noteId}" not found. This might happen if the ID is incorrect, you're using a notebook ID instead of a note ID, or the note has been deleted. Use search_notes to find notes and their IDs.`,
        )
      }
      const message = error instanceof Error ? error.message : "Unknown error"
      throw new ToolError(
        `Failed to read note "${noteId}": ${message}. Make sure you're using a valid note ID. Use search_notes to find notes and their IDs.`,
      )
    }
  }
}

export default ReadNote
