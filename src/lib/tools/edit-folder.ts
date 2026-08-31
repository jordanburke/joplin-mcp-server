import type { JoplinFolder } from "./base-tool.js"
import BaseTool, { extractJoplinErrorMessage, ToolError } from "./base-tool.js"

type EditFolderOptions = {
  folder_id: string
  title?: string | undefined
  parent_id?: string | undefined
}

type EditFolderResponse = JoplinFolder & {
  updated_time: number
}

class EditFolder extends BaseTool {
  async call(options: EditFolderOptions): Promise<string> {
    if (!options || typeof options !== "object") {
      return 'Please provide folder edit options. Example: edit_folder {"folder_id": "abc123", "title": "New Name"}'
    }

    // Validate required folder_id
    if (!options.folder_id) {
      return 'Please provide folder edit options. Example: edit_folder {"folder_id": "abc123", "title": "New Name"}'
    }

    const folderIdError = this.validateId(options.folder_id, "notebook")
    if (folderIdError) {
      return folderIdError.replace("notebook ID", "folder ID").replace("notebook_id", "folder_id")
    }

    // Validate that we have at least one field to update
    const updateFields = ["title", "parent_id"]
    const hasUpdate = updateFields.some((field) => options[field as keyof EditFolderOptions] !== undefined)

    if (!hasUpdate) {
      return "Please provide at least one field to update. Available fields: title, parent_id"
    }

    // Validate title if provided
    if (options.title !== undefined && (typeof options.title !== "string" || options.title.trim() === "")) {
      return "Title must be a non-empty string."
    }

    // Validate parent_id if provided
    if (options.parent_id !== undefined && options.parent_id !== null && options.parent_id !== "") {
      if (options.parent_id.length < 10 || !options.parent_id.match(/[a-f0-9]/i)) {
        return `Error: "${options.parent_id}" does not appear to be a valid parent notebook ID.\n\nNotebook IDs are long alphanumeric strings like "58a0a29f68bc4141b49c99f5d367638a".\n\nUse list_notebooks to see available notebooks and their IDs.`
      }

      // Prevent self-parenting
      if (options.parent_id === options.folder_id) {
        return "Error: A folder cannot be its own parent."
      }
    }

    try {
      // First, get the current folder to show before/after comparison
      const currentFolder = this.unwrap(
        await this.apiClient.get<JoplinFolder>(`/folders/${options.folder_id}`, {
          query: { fields: "id,title,parent_id" },
        }),
      )

      const currentFolderError = extractJoplinErrorMessage(currentFolder)
      if (currentFolderError !== undefined) {
        throw new ToolError(`Failed to load folder "${options.folder_id}": ${currentFolderError}`)
      }
      if (!currentFolder?.id) {
        throw new ToolError(
          `Folder with ID "${options.folder_id}" not found. Use list_notebooks to see available folders and their IDs.`,
        )
      }

      // Prepare the update body - only include fields that are being updated
      const updateBody: Partial<EditFolderOptions> = {}

      if (options.title !== undefined) updateBody.title = options.title.trim()
      if (options.parent_id !== undefined) updateBody.parent_id = options.parent_id

      // Update the folder
      const updatedFolder = this.unwrap(
        await this.apiClient.put<EditFolderResponse>(`/folders/${options.folder_id}`, updateBody),
      )

      // Joplin can respond with HTTP 200 and `{ error: "..." }` in the body when
      // an operation fails. Catch that before treating it as success.
      const joplinError = extractJoplinErrorMessage(updatedFolder)
      if (joplinError !== undefined) {
        throw new ToolError(`Failed to update folder: ${joplinError}`)
      }
      if (!updatedFolder || typeof updatedFolder !== "object" || !updatedFolder.id) {
        throw new ToolError(
          `Failed to update folder: Joplin API returned an unexpected response (no folder id). Raw response: ${JSON.stringify(updatedFolder)}`,
        )
      }

      // Get parent folder info for both old and new locations if parent_id changed
      const fetchParentInfo = async (parentId: string): Promise<string> => {
        try {
          const parent = this.unwrap(
            await this.apiClient.get<JoplinFolder>(`/folders/${parentId}`, {
              query: { fields: "title" },
            }),
          )
          if (parent?.title) {
            return `Inside "${parent.title}"`
          }
          return `Parent ID: ${parentId}`
        } catch {
          return `Parent ID: ${parentId}`
        }
      }

      const oldParentInfo = currentFolder.parent_id ? await fetchParentInfo(currentFolder.parent_id) : "Top level"
      const newParentInfo = await (async (): Promise<string> => {
        if (!updatedFolder.parent_id) return "Top level"
        if (updatedFolder.parent_id === currentFolder.parent_id) return oldParentInfo
        return fetchParentInfo(updatedFolder.parent_id)
      })()

      // Format success response with before/after comparison
      const resultLines: string[] = []
      resultLines.push(`✅ Successfully updated notebook!`)
      resultLines.push("")
      resultLines.push(`📁 Notebook: "${updatedFolder.title}"`)
      resultLines.push(`   Folder ID: ${updatedFolder.id}`)
      resultLines.push("")

      // Show what changed
      resultLines.push(`🔄 Changes made:`)

      if (options.title !== undefined && currentFolder.title !== updatedFolder.title) {
        resultLines.push(`   Title: "${currentFolder.title}" → "${updatedFolder.title}"`)
      }

      if (options.parent_id !== undefined && currentFolder.parent_id !== updatedFolder.parent_id) {
        resultLines.push(`   Location: ${oldParentInfo} → ${newParentInfo}`)
      }

      if (updatedFolder.updated_time) {
        const updatedTime = this.formatDate(updatedFolder.updated_time)
        resultLines.push(`   Last Updated: ${updatedTime}`)
      }

      resultLines.push("")
      resultLines.push(`🔗 Next steps:`)
      resultLines.push(`   - View notebook: read_notebook notebook_id="${updatedFolder.id}"`)
      resultLines.push(`   - View all notebooks: list_notebooks`)
      if (updatedFolder.parent_id) {
        resultLines.push(`   - View parent notebook: read_notebook notebook_id="${updatedFolder.parent_id}"`)
      }

      return resultLines.join("\n")
    } catch (error: unknown) {
      if (error instanceof ToolError) throw error

      const err = error as {
        response?: { status?: number; data?: { error?: string } }
        config?: { url?: string }
      }
      process.stderr.write(`updating folder error: ${error}\n`)
      if (err.response) {
        if (err.response.status === 404) {
          if (err.config?.url?.includes(`/folders/${options.folder_id}`) === true) {
            throw new ToolError(
              `Failed to update folder: Folder with ID "${options.folder_id}" not found. Use list_notebooks to see available folders and their IDs.`,
            )
          }
          if (options.parent_id !== undefined) {
            throw new ToolError(
              `Failed to update folder: Parent folder with ID "${options.parent_id}" not found. Use list_notebooks to see available folders and their IDs.`,
            )
          }
        }
        if (err.response.status === 400) {
          throw new ToolError(
            `Failed to update folder: Invalid request data. ${err.response.data?.error ?? "Please check your input parameters."}`,
          )
        }
        if (err.response.status === 409) {
          throw new ToolError(
            `Failed to update folder: A folder with the title "${options.title ?? ""}" might already exist in this location. Try a different title or check existing folders with list_notebooks.`,
          )
        }
      }
      const message = error instanceof Error ? error.message : "Unknown error"
      throw new ToolError(`Failed to update folder: ${message}`)
    }
  }
}

export default EditFolder
