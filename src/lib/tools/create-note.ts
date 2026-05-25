import type { JoplinFolder, JoplinNote } from "./base-tool.js"
import BaseTool, { extractJoplinErrorMessage, ToolError } from "./base-tool.js"

interface CreateNoteOptions {
  title?: string | undefined
  body?: string | undefined
  body_html?: string | undefined
  parent_id?: string | undefined
  is_todo?: boolean | undefined
  image_data_url?: string | undefined
}

type CreateNoteResponse = JoplinNote

class CreateNote extends BaseTool {
  async call(options: CreateNoteOptions): Promise<string> {
    if (!options || typeof options !== "object") {
      return 'Please provide note creation options. Example: create_note {"title": "My Note", "body": "Note content"}'
    }

    // Validate that we have at least a title or body
    if (!options.title && !options.body && !options.body_html) {
      return "Please provide at least a title, body, or body_html for the note."
    }

    // Validate parent_id if provided
    if (options.parent_id && (options.parent_id.length < 10 || !options.parent_id.match(/[a-f0-9]/i))) {
      return `Error: "${options.parent_id}" does not appear to be a valid notebook ID.\n\nNotebook IDs are long alphanumeric strings like "58a0a29f68bc4141b49c99f5d367638a".\n\nUse list_notebooks to see available notebooks and their IDs.`
    }

    try {
      // Prepare the request body
      const requestBody: CreateNoteOptions = {}

      if (options.title) requestBody.title = options.title
      if (options.body) requestBody.body = options.body
      if (options.body_html) requestBody.body_html = options.body_html
      if (options.parent_id) requestBody.parent_id = options.parent_id
      if (options.is_todo !== undefined) requestBody.is_todo = options.is_todo
      if (options.image_data_url) requestBody.image_data_url = options.image_data_url

      // Create the note
      const createdNote = this.unwrap(await this.apiClient.post<CreateNoteResponse>("/notes", requestBody))

      // Joplin can respond with HTTP 200 and `{ error: "..." }` in the body when
      // an operation fails (e.g. invalid parent_id). Catch that before treating
      // it as a successful response.
      const joplinError = extractJoplinErrorMessage(createdNote)
      if (joplinError !== undefined) {
        throw new ToolError(`Failed to create note: ${joplinError}`)
      }
      if (!createdNote || typeof createdNote !== "object" || !createdNote.id) {
        throw new ToolError(
          `Failed to create note: Joplin API returned an unexpected response (no note id). Raw response: ${JSON.stringify(createdNote)}`,
        )
      }

      // Get notebook info if available
      const notebookInfo = await (async (): Promise<string> => {
        if (!createdNote.parent_id) return "Root level"
        try {
          const notebook = this.unwrap(
            await this.apiClient.get<JoplinFolder>(`/folders/${createdNote.parent_id}`, {
              query: { fields: "id,title" },
            }),
          )
          if (notebook?.title) {
            return `"${notebook.title}" (notebook_id: "${createdNote.parent_id}")`
          }
          return `Notebook ID: ${createdNote.parent_id}`
        } catch {
          return `Notebook ID: ${createdNote.parent_id}`
        }
      })()

      // Format success response
      const resultLines: string[] = []
      resultLines.push(`✅ Successfully created note!`)
      resultLines.push("")
      resultLines.push(`📝 Note Details:`)
      resultLines.push(`   Title: "${createdNote.title || "Untitled"}"`)
      resultLines.push(`   Note ID: ${createdNote.id}`)
      resultLines.push(`   Location: ${notebookInfo}`)

      if (createdNote.is_todo) {
        resultLines.push(`   Type: Todo item`)
      }

      const createdDate = this.formatDate(createdNote.created_time)
      resultLines.push(`   Created: ${createdDate}`)

      resultLines.push("")
      resultLines.push(`🔗 Next steps:`)
      resultLines.push(`   - Read the note: read_note note_id="${createdNote.id}"`)
      if (createdNote.parent_id) {
        resultLines.push(`   - View notebook: read_notebook notebook_id="${createdNote.parent_id}"`)
      }
      resultLines.push(`   - Search for it: search_notes query="${createdNote.title}"`)

      return resultLines.join("\n")
    } catch (error: unknown) {
      // Re-throw ToolErrors as-is (already formatted for the caller)
      if (error instanceof ToolError) throw error

      const err = error as { response?: { status?: number; data?: { error?: string } } }
      process.stderr.write(`creating note error: ${error}\n`)
      if (err.response) {
        if (err.response.status === 400) {
          throw new ToolError(
            `Failed to create note: Invalid request data. ${err.response.data?.error ?? "Please check your input parameters."}`,
          )
        }
        if (err.response.status === 404 && options.parent_id !== undefined) {
          throw new ToolError(
            `Failed to create note: Notebook with ID "${options.parent_id}" not found. Use list_notebooks to see available notebooks and their IDs.`,
          )
        }
      }
      const message = error instanceof Error ? error.message : "Unknown error"
      throw new ToolError(`Failed to create note: ${message}`)
    }
  }
}

export default CreateNote
