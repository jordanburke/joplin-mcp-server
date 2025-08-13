import JoplinAPIClient from "../joplin-api-client.js"

interface JoplinFolder {
  id: string
  title: string
  parent_id?: string
}

interface JoplinNote {
  id: string
  title: string
  body?: string
  parent_id?: string
  created_time: number
  updated_time: number
  is_todo: boolean
  todo_completed?: boolean
  todo_due?: number
}

abstract class BaseTool {
  protected apiClient: JoplinAPIClient

  constructor(apiClient: JoplinAPIClient) {
    this.apiClient = apiClient
  }

  abstract call(...args: any[]): Promise<string>

  protected formatError(error: any, context: string): string {
    process.stderr.write(`${context} error: ${error}\n`)
    return `Error ${context.toLowerCase()}: ${error.message || "Unknown error"}`
  }

  protected validateId(id: string, type: "note" | "notebook"): string | null {
    if (!id) {
      return `Please provide a ${type} ID. Example: ${type === "note" ? "read_note" : "read_notebook"} ${type}_id="your-${type}-id"`
    }

    if (id.length < 10 || !id.match(/[a-f0-9]/i)) {
      const searchHint = type === "note" ? "search_notes" : "list_notebooks"
      return `Error: "${id}" does not appear to be a valid ${type} ID. \n\n${type.charAt(0).toUpperCase() + type.slice(1)} IDs are long alphanumeric strings like "58a0a29f68bc4141b49c99f5d367638a".\n\nUse ${searchHint} to ${type === "note" ? "find notes" : "see all available notebooks"} and their IDs.`
    }

    return null
  }

  protected formatDate(timestamp: number): string {
    return new Date(timestamp).toLocaleString()
  }
}

export default BaseTool
export type { JoplinFolder, JoplinNote }
