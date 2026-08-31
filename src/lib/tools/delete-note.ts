import type { JoplinFolder, JoplinNote } from "./base-tool.js"
import BaseTool, { extractJoplinErrorMessage, ToolError } from "./base-tool.js"

type DeleteNoteOptions = {
  note_id: string
  confirm?: boolean | undefined
}

class DeleteNote extends BaseTool {
  async call(options: DeleteNoteOptions): Promise<string> {
    if (!options || typeof options !== "object") {
      return 'Please provide note deletion options. Example: delete_note {"note_id": "abc123", "confirm": true}'
    }

    // Validate required note_id
    if (!options.note_id) {
      return 'Please provide note deletion options. Example: delete_note {"note_id": "abc123", "confirm": true}'
    }

    const noteIdError = this.validateId(options.note_id, "note")
    if (noteIdError) {
      return noteIdError
    }

    // Require explicit confirmation for safety
    if (!options.confirm) {
      return `⚠️  This will permanently delete the note!\n\nTo confirm deletion, use:\ndelete_note {"note_id": "${options.note_id}", "confirm": true}\n\n⚠️  This action cannot be undone!`
    }

    try {
      // First, get the note details to show what's being deleted
      const noteToDelete = this.unwrap(
        await this.apiClient.get<JoplinNote>(`/notes/${options.note_id}`, {
          query: { fields: "id,title,body,parent_id,is_todo,todo_completed,created_time,updated_time" },
        }),
      )

      const noteLoadError = extractJoplinErrorMessage(noteToDelete)
      if (noteLoadError !== undefined) {
        throw new ToolError(`Failed to load note "${options.note_id}": ${noteLoadError}`)
      }
      if (!noteToDelete?.id) {
        throw new ToolError(
          `Note with ID "${options.note_id}" not found. Use search_notes to find notes and their IDs.`,
        )
      }

      // Get notebook info if available
      const notebookInfo = await (async (): Promise<string> => {
        if (!noteToDelete.parent_id) return "Root level"
        try {
          const notebook = this.unwrap(
            await this.apiClient.get<JoplinFolder>(`/folders/${noteToDelete.parent_id}`, {
              query: { fields: "title" },
            }),
          )
          if (notebook?.title) {
            return `"${notebook.title}" (notebook_id: "${noteToDelete.parent_id}")`
          }
          return `Notebook ID: ${noteToDelete.parent_id}`
        } catch {
          return `Notebook ID: ${noteToDelete.parent_id}`
        }
      })()

      // Delete the note
      const deleteResponse = this.unwrap(await this.apiClient.delete(`/notes/${options.note_id}`))
      const deleteError = extractJoplinErrorMessage(deleteResponse)
      if (deleteError !== undefined) {
        throw new ToolError(`Failed to delete note: ${deleteError}`)
      }

      // Format success response
      const resultLines: string[] = []
      resultLines.push(`🗑️  Successfully deleted note!`)
      resultLines.push("")
      resultLines.push(`📝 Deleted Note Details:`)
      resultLines.push(`   Title: "${noteToDelete.title || "Untitled"}"`)
      resultLines.push(`   Note ID: ${noteToDelete.id}`)
      resultLines.push(`   Location: ${notebookInfo}`)

      if (noteToDelete.is_todo) {
        const status = noteToDelete.todo_completed ? "Completed" : "Not completed"
        resultLines.push(`   Type: Todo (${status})`)
      } else {
        resultLines.push(`   Type: Regular note`)
      }

      const createdDate = this.formatDate(noteToDelete.created_time)
      const updatedDate = this.formatDate(noteToDelete.updated_time)
      resultLines.push(`   Created: ${createdDate}`)
      resultLines.push(`   Last Updated: ${updatedDate}`)

      // Show content preview if available
      if (noteToDelete.body) {
        const preview = noteToDelete.body.substring(0, 100).replace(/\n/g, " ")
        const truncated = noteToDelete.body.length > 100 ? "..." : ""
        resultLines.push(`   Content Preview: ${preview}${truncated}`)
      }

      resultLines.push("")
      resultLines.push(`⚠️  This note has been permanently deleted and cannot be recovered.`)

      if (noteToDelete.parent_id) {
        resultLines.push("")
        resultLines.push(`🔗 Related actions:`)
        resultLines.push(`   - View containing notebook: read_notebook notebook_id="${noteToDelete.parent_id}"`)
        resultLines.push(`   - Search for similar notes: search_notes query="${noteToDelete.title}"`)
      }

      return resultLines.join("\n")
    } catch (error: unknown) {
      if (error instanceof ToolError) throw error

      const err = error as { response?: { status?: number } }
      process.stderr.write(`deleting note error: ${error}\n`)
      if (err.response) {
        if (err.response.status === 404) {
          throw new ToolError(
            `Failed to delete note: Note with ID "${options.note_id}" not found. Use search_notes to find notes and their IDs.`,
          )
        }
        if (err.response.status === 403) {
          throw new ToolError(
            `Failed to delete note: Permission denied for note with ID "${options.note_id}". This might be a protected system note.`,
          )
        }
      }
      const message = error instanceof Error ? error.message : "Unknown error"
      throw new ToolError(`Failed to delete note: ${message}`)
    }
  }
}

export default DeleteNote
