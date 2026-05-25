import type { JoplinFolder } from "./base-tool.js"
import BaseTool from "./base-tool.js"

interface DeleteFolderOptions {
  folder_id: string
  confirm?: boolean | undefined
  force?: boolean | undefined
}

type FolderItem = { id: string; title?: string; parent_id?: string }

interface FolderContents {
  items: FolderItem[]
}

class DeleteFolder extends BaseTool {
  async call(options: DeleteFolderOptions): Promise<string> {
    if (!options || typeof options !== "object") {
      return 'Please provide folder deletion options. Example: delete_folder {"folder_id": "abc123", "confirm": true}'
    }

    // Validate required folder_id
    if (!options.folder_id) {
      return 'Please provide folder deletion options. Example: delete_folder {"folder_id": "abc123", "confirm": true}'
    }

    const folderIdError = this.validateId(options.folder_id, "notebook")
    if (folderIdError) {
      return folderIdError.replace("notebook ID", "folder ID").replace("notebook_id", "folder_id")
    }

    // Require explicit confirmation for safety
    if (!options.confirm) {
      return `⚠️  This will permanently delete the notebook/folder!\n\nTo confirm deletion, use:\ndelete_folder {"folder_id": "${options.folder_id}", "confirm": true}\n\n⚠️  This action cannot be undone!`
    }

    try {
      // First, get the folder details to show what's being deleted
      const folderToDelete = this.unwrap(
        await this.apiClient.get<JoplinFolder>(`/folders/${options.folder_id}`, {
          query: { fields: "id,title,parent_id" },
        }),
      )

      if (!folderToDelete?.id) {
        return `Folder with ID "${options.folder_id}" not found.\n\nUse list_notebooks to see available folders and their IDs.`
      }

      // Check if folder contains notes or subfolders
      const [notes, subfolders] = await Promise.all([
        this.apiClient
          .get<FolderContents>(`/folders/${options.folder_id}/notes`, {
            query: { fields: "id,title" },
          })
          .then((result) =>
            result.fold(
              () => ({ items: [] }),
              (data) => data,
            ),
          ),
        this.apiClient
          .get<FolderContents>("/folders", {
            query: { fields: "id,title,parent_id" },
          })
          .then((result) =>
            result.fold<FolderContents>(
              () => ({ items: [] }),
              (response) => ({
                items: response.items.filter((folder) => folder.parent_id === options.folder_id),
              }),
            ),
          ),
      ])

      const noteCount = notes.items.length
      const subfolderCount = subfolders.items.length
      const totalContent = noteCount + subfolderCount

      // Warn if folder is not empty and force is not specified
      if (totalContent > 0 && !options.force) {
        const resultLines: string[] = []
        resultLines.push(`⚠️  Cannot delete non-empty notebook!`)
        resultLines.push("")
        resultLines.push(`📁 Notebook: "${folderToDelete.title}"`)
        resultLines.push(`   Contains: ${noteCount} notes and ${subfolderCount} subfolders`)

        if (noteCount > 0) {
          resultLines.push("")
          resultLines.push(`📝 Contains ${noteCount} notes:`)
          notes.items.slice(0, 5).forEach((note) => {
            resultLines.push(`   - ${note.title ?? "Untitled"}`)
          })
          if (noteCount > 5) {
            resultLines.push(`   ... and ${noteCount - 5} more notes`)
          }
        }

        if (subfolderCount > 0) {
          resultLines.push("")
          resultLines.push(`📁 Contains ${subfolderCount} subfolders:`)
          subfolders.items.slice(0, 5).forEach((folder) => {
            resultLines.push(`   - ${folder.title ?? "Untitled"}`)
          })
          if (subfolderCount > 5) {
            resultLines.push(`   ... and ${subfolderCount - 5} more folders`)
          }
        }

        resultLines.push("")
        resultLines.push(`💡 Options:`)
        resultLines.push(`   1. Move or delete the contents first, then delete the folder`)
        resultLines.push(`   2. Force delete (⚠️  DESTROYS ALL CONTENT):`)
        resultLines.push(`      delete_folder {"folder_id": "${options.folder_id}", "confirm": true, "force": true}`)
        resultLines.push("")
        resultLines.push(`⚠️  Force delete will permanently delete ALL ${totalContent} items inside!`)

        return resultLines.join("\n")
      }

      // Get parent folder info if available
      const parentInfo = await (async (): Promise<string> => {
        if (!folderToDelete.parent_id) return "Top level"
        try {
          const parentFolder = this.unwrap(
            await this.apiClient.get<JoplinFolder>(`/folders/${folderToDelete.parent_id}`, {
              query: { fields: "title" },
            }),
          )
          if (parentFolder?.title) {
            return `Inside "${parentFolder.title}" (notebook_id: "${folderToDelete.parent_id}")`
          }
          return `Parent ID: ${folderToDelete.parent_id}`
        } catch {
          return `Parent ID: ${folderToDelete.parent_id}`
        }
      })()

      // Delete the folder
      this.unwrap(await this.apiClient.delete(`/folders/${options.folder_id}`))

      // Format success response
      const resultLines: string[] = []
      resultLines.push(`🗑️  Successfully deleted notebook!`)
      resultLines.push("")
      resultLines.push(`📁 Deleted Notebook Details:`)
      resultLines.push(`   Title: "${folderToDelete.title}"`)
      resultLines.push(`   Folder ID: ${folderToDelete.id}`)
      resultLines.push(`   Location: ${parentInfo}`)

      if (totalContent > 0) {
        resultLines.push(`   Deleted Content: ${noteCount} notes and ${subfolderCount} subfolders`)
        resultLines.push("")
        resultLines.push(`⚠️  All ${totalContent} items inside have been permanently deleted!`)
      }

      resultLines.push("")
      resultLines.push(`⚠️  This notebook has been permanently deleted and cannot be recovered.`)

      if (folderToDelete.parent_id) {
        resultLines.push("")
        resultLines.push(`🔗 Related actions:`)
        resultLines.push(`   - View parent notebook: read_notebook notebook_id="${folderToDelete.parent_id}"`)
        resultLines.push(`   - View all notebooks: list_notebooks`)
      }

      return resultLines.join("\n")
    } catch (error: unknown) {
      const err = error as { response?: { status?: number } }
      if (err.response) {
        if (err.response.status === 404) {
          return `Folder with ID "${options.folder_id}" not found.\n\nUse list_notebooks to see available folders and their IDs.`
        }
        if (err.response.status === 403) {
          return `Permission denied: Cannot delete folder with ID "${options.folder_id}".\n\nThis might be a protected system folder.`
        }
        if (err.response.status === 409) {
          return `Cannot delete folder: It may contain items that prevent deletion.\n\nTry moving or deleting the contents first, or use force option.`
        }
      }
      return this.formatError(error, "deleting folder")
    }
  }
}

export default DeleteFolder
