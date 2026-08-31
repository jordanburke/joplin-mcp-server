import type { JoplinFolder } from "./base-tool.js"
import BaseTool, { extractJoplinErrorMessage, ToolError } from "./base-tool.js"

type CreateFolderOptions = {
  title: string
  parent_id?: string | undefined
}

type CreateFolderResponse = JoplinFolder & {
  created_time: number
  updated_time: number
}

class CreateFolder extends BaseTool {
  async call(options: CreateFolderOptions): Promise<string> {
    if (!options || typeof options !== "object") {
      return 'Please provide folder creation options. Example: create_folder {"title": "My Notebook"}'
    }

    // Validate required title
    if (!options.title || typeof options.title !== "string" || options.title.trim() === "") {
      return 'Please provide a title for the folder/notebook. Example: create_folder {"title": "My Notebook"}'
    }

    // Validate parent_id if provided
    if (options.parent_id && (options.parent_id.length < 10 || !options.parent_id.match(/[a-f0-9]/i))) {
      return `Error: "${options.parent_id}" does not appear to be a valid parent notebook ID.\n\nNotebook IDs are long alphanumeric strings like "58a0a29f68bc4141b49c99f5d367638a".\n\nUse list_notebooks to see available notebooks and their IDs, or omit parent_id to create a top-level notebook.`
    }

    try {
      // Prepare the request body
      const requestBody: CreateFolderOptions = {
        title: options.title.trim(),
      }

      if (options.parent_id) {
        requestBody.parent_id = options.parent_id
      }

      // Create the folder
      const createdFolder = this.unwrap(await this.apiClient.post<CreateFolderResponse>("/folders", requestBody))

      // Joplin can respond with HTTP 200 and `{ error: "..." }` in the body when
      // an operation fails. Catch that before treating it as success.
      const joplinError = extractJoplinErrorMessage(createdFolder)
      if (joplinError !== undefined) {
        throw new ToolError(`Failed to create notebook: ${joplinError}`)
      }
      if (!createdFolder || typeof createdFolder !== "object" || !createdFolder.id) {
        throw new ToolError(
          `Failed to create notebook: Joplin API returned an unexpected response (no folder id). Raw response: ${JSON.stringify(createdFolder)}`,
        )
      }

      // Get parent notebook info if available
      const parentInfo = await (async (): Promise<string> => {
        if (!createdFolder.parent_id) return "Top level"
        try {
          const parentNotebook = this.unwrap(
            await this.apiClient.get<JoplinFolder>(`/folders/${createdFolder.parent_id}`, {
              query: { fields: "id,title" },
            }),
          )
          if (parentNotebook?.title) {
            return `Inside "${parentNotebook.title}" (notebook_id: "${createdFolder.parent_id}")`
          }
          return `Parent notebook ID: ${createdFolder.parent_id}`
        } catch {
          return `Parent notebook ID: ${createdFolder.parent_id}`
        }
      })()

      // Format success response
      const resultLines: string[] = []
      resultLines.push(`✅ Successfully created notebook!`)
      resultLines.push("")
      resultLines.push(`📁 Notebook Details:`)
      resultLines.push(`   Title: "${createdFolder.title}"`)
      resultLines.push(`   Notebook ID: ${createdFolder.id}`)
      resultLines.push(`   Location: ${parentInfo}`)

      const createdDate = this.formatDate(createdFolder.created_time)
      resultLines.push(`   Created: ${createdDate}`)

      resultLines.push("")
      resultLines.push(`🔗 Next steps:`)
      resultLines.push(`   - View notebook: read_notebook notebook_id="${createdFolder.id}"`)
      resultLines.push(`   - Create a note in it: create_note {"title": "My Note", "parent_id": "${createdFolder.id}"}`)
      resultLines.push(`   - View all notebooks: list_notebooks`)

      return resultLines.join("\n")
    } catch (error: unknown) {
      if (error instanceof ToolError) throw error

      const err = error as { response?: { status?: number; data?: { error?: string } } }
      process.stderr.write(`creating notebook error: ${error}\n`)
      if (err.response) {
        if (err.response.status === 400) {
          throw new ToolError(
            `Failed to create notebook: Invalid request data. ${err.response.data?.error ?? "Please check your input parameters."}`,
          )
        }
        if (err.response.status === 404 && options.parent_id !== undefined) {
          throw new ToolError(
            `Failed to create notebook: Parent notebook with ID "${options.parent_id}" not found. Use list_notebooks to see available notebooks and their IDs, or omit parent_id to create a top-level notebook.`,
          )
        }
        if (err.response.status === 409) {
          throw new ToolError(
            `Failed to create notebook: A notebook with the title "${options.title}" might already exist in this location. Try a different title or check existing notebooks with list_notebooks.`,
          )
        }
      }
      const message = error instanceof Error ? error.message : "Unknown error"
      throw new ToolError(`Failed to create notebook: ${message}`)
    }
  }
}

export default CreateFolder
