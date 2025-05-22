import BaseTool, { JoplinFolder } from "./base-tool.js"

interface CreateFolderOptions {
  title: string
  parent_id?: string | undefined
}

interface CreateFolderResponse extends JoplinFolder {
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
      const createdFolder = await this.apiClient.post<CreateFolderResponse>("/folders", requestBody)

      // Validate response
      if (!createdFolder || typeof createdFolder !== "object" || !createdFolder.id) {
        return "Error: Unexpected response format from Joplin API when creating folder"
      }

      // Get parent notebook info if available
      let parentInfo = "Top level"
      if (createdFolder.parent_id) {
        try {
          const parentNotebook = await this.apiClient.get(`/folders/${createdFolder.parent_id}`, {
            query: { fields: "id,title" },
          })
          if (parentNotebook && parentNotebook.title) {
            parentInfo = `Inside "${parentNotebook.title}" (notebook_id: "${createdFolder.parent_id}")`
          }
        } catch (error) {
          // Continue even if we can't get parent info
          parentInfo = `Parent notebook ID: ${createdFolder.parent_id}`
        }
      }

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
    } catch (error: any) {
      if (error.response) {
        // Handle specific API errors
        if (error.response.status === 400) {
          return `Error creating notebook: Invalid request data.\n\nPlease check your input parameters. ${error.response.data?.error || ""}`
        }
        if (error.response.status === 404 && options.parent_id) {
          return `Error: Parent notebook with ID "${options.parent_id}" not found.\n\nUse list_notebooks to see available notebooks and their IDs, or omit parent_id to create a top-level notebook.`
        }
        if (error.response.status === 409) {
          return `Error: A notebook with the title "${options.title}" might already exist in this location.\n\nTry a different title or check existing notebooks with list_notebooks.`
        }
      }
      return this.formatError(error, "creating notebook")
    }
  }
}

export default CreateFolder
