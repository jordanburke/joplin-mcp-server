import BaseTool, { JoplinNote } from "./base-tool.js"

interface DeleteNoteOptions {
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
      const noteToDelete = await this.apiClient.get<JoplinNote>(`/notes/${options.note_id}`, {
        query: { fields: "id,title,body,parent_id,is_todo,todo_completed,created_time,updated_time" },
      })

      if (!noteToDelete || !noteToDelete.id) {
        return `Note with ID "${options.note_id}" not found.\n\nUse search_notes to find notes and their IDs.`
      }

      // Get notebook info if available
      let notebookInfo = "Root level"
      if (noteToDelete.parent_id) {
        try {
          const notebook = await this.apiClient.get(`/folders/${noteToDelete.parent_id}`, {
            query: { fields: "title" },
          })
          if (notebook?.title) {
            notebookInfo = `"${notebook.title}" (notebook_id: "${noteToDelete.parent_id}")`
          }
        } catch {
          notebookInfo = `Notebook ID: ${noteToDelete.parent_id}`
        }
      }

      // Delete the note
      await this.apiClient.delete(`/notes/${options.note_id}`)

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
    } catch (error: any) {
      if (error.response) {
        if (error.response.status === 404) {
          return `Note with ID "${options.note_id}" not found.\n\nUse search_notes to find notes and their IDs.`
        }
        if (error.response.status === 403) {
          return `Permission denied: Cannot delete note with ID "${options.note_id}".\n\nThis might be a protected system note.`
        }
      }
      return this.formatError(error, "deleting note")
    }
  }
}

export default DeleteNote
