import BaseTool, { JoplinNote, JoplinFolder } from "./base-tool.js"

class ReadNote extends BaseTool {
  async call(noteId: string): Promise<string> {
    const validationError = this.validateId(noteId, "note")
    if (validationError) {
      return validationError
    }

    try {
      // Get the note details with all relevant fields
      const note = await this.apiClient.get<JoplinNote>(`/notes/${noteId}`, {
        query: {
          fields: "id,title,body,parent_id,created_time,updated_time,is_todo,todo_completed,todo_due",
        },
      })

      // Validate note response
      if (!note || typeof note !== "object" || !note.id) {
        return `Error: Unexpected response format from Joplin API when fetching note`
      }

      // Get the notebook info to show where this note is located
      let notebookInfo = "Unknown notebook"
      if (note.parent_id) {
        try {
          const notebook = await this.apiClient.get<JoplinFolder>(`/folders/${note.parent_id}`, {
            query: { fields: "id,title" },
          })
          if (notebook && notebook.title) {
            notebookInfo = `"${notebook.title}" (notebook_id: "${note.parent_id}")`
          }
        } catch (_error) {
          process.stderr.write(`Error fetching notebook info: ${_error}\n`)
          // Continue even if we can't get the notebook info
        }
      }

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
    } catch (_error: any) {
      if (_error.response && _error.response.status === 404) {
        return `Note with ID "${noteId}" not found.\n\nThis might happen if:\n1. The ID is incorrect\n2. You're using a notebook ID instead of a note ID\n3. The note has been deleted\n\nUse search_notes to find notes and their IDs.`
      }
      return (
        this.formatError(_error, "reading note") +
        `\n\nMake sure you're using a valid note ID.\nUse search_notes to find notes and their IDs.`
      )
    }
  }
}

export default ReadNote
