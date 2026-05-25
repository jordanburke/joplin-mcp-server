import type { JoplinFolder, JoplinNote } from "./base-tool.js"
import BaseTool from "./base-tool.js"

interface EditNoteOptions {
  note_id: string
  title?: string | undefined
  body?: string | undefined
  body_html?: string | undefined
  parent_id?: string | undefined
  is_todo?: boolean | undefined
  todo_completed?: boolean | undefined
  todo_due?: number | undefined
}

type EditNoteResponse = JoplinNote

class EditNote extends BaseTool {
  async call(options: EditNoteOptions): Promise<string> {
    if (!options || typeof options !== "object") {
      return 'Please provide note edit options. Example: edit_note {"note_id": "abc123", "title": "Updated Title"}'
    }

    // Validate required note_id
    if (!options.note_id) {
      return 'Please provide note edit options. Example: edit_note {"note_id": "abc123", "title": "Updated Title"}'
    }

    const noteIdError = this.validateId(options.note_id, "note")
    if (noteIdError) {
      return noteIdError
    }

    // Validate that we have at least one field to update
    const updateFields = ["title", "body", "body_html", "parent_id", "is_todo", "todo_completed", "todo_due"]
    const hasUpdate = updateFields.some((field) => options[field as keyof EditNoteOptions] !== undefined)

    if (!hasUpdate) {
      return "Please provide at least one field to update. Available fields: title, body, body_html, parent_id, is_todo, todo_completed, todo_due"
    }

    // Validate parent_id if provided
    if (options.parent_id !== undefined && options.parent_id !== null && options.parent_id !== "") {
      if (options.parent_id.length < 10 || !options.parent_id.match(/[a-f0-9]/i)) {
        return `Error: "${options.parent_id}" does not appear to be a valid notebook ID.\n\nNotebook IDs are long alphanumeric strings like "58a0a29f68bc4141b49c99f5d367638a".\n\nUse list_notebooks to see available notebooks and their IDs.`
      }
    }

    try {
      // First, get the current note to show before/after comparison
      const currentNote = this.unwrap(
        await this.apiClient.get<JoplinNote>(`/notes/${options.note_id}`, {
          query: { fields: "id,title,body,parent_id,is_todo,todo_completed,todo_due,updated_time" },
        }),
      )

      if (!currentNote?.id) {
        return `Note with ID "${options.note_id}" not found.\n\nUse search_notes to find notes and their IDs.`
      }

      // Prepare the update body - only include fields that are being updated
      const updateBody: Partial<EditNoteOptions> = {}

      if (options.title !== undefined) updateBody.title = options.title
      if (options.body !== undefined) updateBody.body = options.body
      if (options.body_html !== undefined) updateBody.body_html = options.body_html
      if (options.parent_id !== undefined) updateBody.parent_id = options.parent_id
      if (options.is_todo !== undefined) updateBody.is_todo = options.is_todo
      if (options.todo_completed !== undefined) updateBody.todo_completed = options.todo_completed
      if (options.todo_due !== undefined) updateBody.todo_due = options.todo_due

      // Update the note
      const updatedNote = this.unwrap(
        await this.apiClient.put<EditNoteResponse>(`/notes/${options.note_id}`, updateBody),
      )

      // Validate response
      if (!updatedNote || typeof updatedNote !== "object" || !updatedNote.id) {
        return "Error: Unexpected response format from Joplin API when updating note"
      }

      // Get notebook info for both old and new locations if parent_id changed
      const fetchNotebookInfo = async (parentId: string): Promise<string> => {
        try {
          const notebook = this.unwrap(
            await this.apiClient.get<JoplinFolder>(`/folders/${parentId}`, {
              query: { fields: "title" },
            }),
          )
          if (notebook?.title) {
            return `"${notebook.title}"`
          }
          return `Notebook ID: ${parentId}`
        } catch {
          return `Notebook ID: ${parentId}`
        }
      }

      const oldNotebookInfo = currentNote.parent_id ? await fetchNotebookInfo(currentNote.parent_id) : "Root level"
      const newNotebookInfo = await (async (): Promise<string> => {
        if (!updatedNote.parent_id) return "Root level"
        if (updatedNote.parent_id === currentNote.parent_id) return oldNotebookInfo
        return fetchNotebookInfo(updatedNote.parent_id)
      })()

      // Format success response with before/after comparison
      const resultLines: string[] = []
      resultLines.push(`✅ Successfully updated note!`)
      resultLines.push("")
      resultLines.push(`📝 Note: "${updatedNote.title || "Untitled"}"`)
      resultLines.push(`   Note ID: ${updatedNote.id}`)
      resultLines.push("")

      // Show what changed
      resultLines.push(`🔄 Changes made:`)

      if (options.title !== undefined && currentNote.title !== updatedNote.title) {
        resultLines.push(`   Title: "${currentNote.title}" → "${updatedNote.title}"`)
      }

      if (options.parent_id !== undefined && currentNote.parent_id !== updatedNote.parent_id) {
        resultLines.push(`   Location: ${oldNotebookInfo} → ${newNotebookInfo}`)
      }

      if (options.is_todo !== undefined && currentNote.is_todo !== updatedNote.is_todo) {
        const oldType = currentNote.is_todo ? "Todo" : "Regular note"
        const newType = updatedNote.is_todo ? "Todo" : "Regular note"
        resultLines.push(`   Type: ${oldType} → ${newType}`)
      }

      if (options.todo_completed !== undefined && currentNote.todo_completed !== updatedNote.todo_completed) {
        const oldStatus = currentNote.todo_completed ? "Completed" : "Not completed"
        const newStatus = updatedNote.todo_completed ? "Completed" : "Not completed"
        resultLines.push(`   Todo Status: ${oldStatus} → ${newStatus}`)
      }

      if (options.todo_due !== undefined) {
        const oldDue = currentNote.todo_due ? this.formatDate(currentNote.todo_due) : "No due date"
        const newDue = updatedNote.todo_due ? this.formatDate(updatedNote.todo_due) : "No due date"
        if (oldDue !== newDue) {
          resultLines.push(`   Due Date: ${oldDue} → ${newDue}`)
        }
      }

      if (options.body !== undefined) {
        resultLines.push(`   Content: Updated`)
      }

      if (options.body_html !== undefined) {
        resultLines.push(`   HTML Content: Updated`)
      }

      const updatedTime = this.formatDate(updatedNote.updated_time)
      resultLines.push(`   Last Updated: ${updatedTime}`)

      resultLines.push("")
      resultLines.push(`🔗 Next steps:`)
      resultLines.push(`   - Read the note: read_note note_id="${updatedNote.id}"`)
      if (updatedNote.parent_id) {
        resultLines.push(`   - View notebook: read_notebook notebook_id="${updatedNote.parent_id}"`)
      }

      return resultLines.join("\n")
    } catch (error: unknown) {
      const err = error as { response?: { status?: number; data?: { error?: string } } }
      if (err.response) {
        if (err.response.status === 404) {
          return `Note with ID "${options.note_id}" not found.\n\nUse search_notes to find notes and their IDs.`
        }
        if (err.response.status === 400) {
          return `Error updating note: Invalid request data.\n\nPlease check your input parameters. ${err.response.data?.error ?? ""}`
        }
        if (err.response.status === 404 && options.parent_id !== undefined) {
          return `Error: Notebook with ID "${options.parent_id}" not found.\n\nUse list_notebooks to see available notebooks and their IDs.`
        }
      }
      return this.formatError(error, "updating note")
    }
  }
}

export default EditNote
