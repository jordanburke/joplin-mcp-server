import JoplinAPIClient from "./lib/joplin-api-client.js"
import {
  ListNotebooks,
  SearchNotes,
  ReadNotebook,
  ReadNote,
  ReadMultiNote,
  CreateNote,
  CreateFolder,
  EditNote,
  EditFolder,
  DeleteNote,
  DeleteFolder,
} from "./lib/tools/index.js"

export interface JoplinServerConfig {
  port: number
  token: string
}

export class JoplinServerManager {
  private apiClient: JoplinAPIClient
  private tools: {
    listNotebooks: ListNotebooks
    searchNotes: SearchNotes
    readNotebook: ReadNotebook
    readNote: ReadNote
    readMultiNote: ReadMultiNote
    createNote: CreateNote
    createFolder: CreateFolder
    editNote: EditNote
    editFolder: EditFolder
    deleteNote: DeleteNote
    deleteFolder: DeleteFolder
  }

  constructor(config: JoplinServerConfig) {
    this.apiClient = new JoplinAPIClient({
      port: config.port,
      token: config.token,
    })

    // Initialize tools
    this.tools = {
      listNotebooks: new ListNotebooks(this.apiClient),
      searchNotes: new SearchNotes(this.apiClient),
      readNotebook: new ReadNotebook(this.apiClient),
      readNote: new ReadNote(this.apiClient),
      readMultiNote: new ReadMultiNote(this.apiClient),
      createNote: new CreateNote(this.apiClient),
      createFolder: new CreateFolder(this.apiClient),
      editNote: new EditNote(this.apiClient),
      editFolder: new EditFolder(this.apiClient),
      deleteNote: new DeleteNote(this.apiClient),
      deleteFolder: new DeleteFolder(this.apiClient),
    }
  }

  async checkService(): Promise<boolean> {
    return await this.apiClient.serviceAvailable()
  }

  // Tool execution methods
  async listNotebooks(): Promise<string> {
    return await this.tools.listNotebooks.call()
  }

  async searchNotes(query: string): Promise<string> {
    return await this.tools.searchNotes.call(query)
  }

  async readNotebook(notebookId: string): Promise<string> {
    return await this.tools.readNotebook.call(notebookId)
  }

  async readNote(noteId: string): Promise<string> {
    return await this.tools.readNote.call(noteId)
  }

  async readMultiNote(noteIds: string[]): Promise<string> {
    return await this.tools.readMultiNote.call(noteIds)
  }

  async createNote(params: {
    title?: string | undefined
    body?: string | undefined
    body_html?: string | undefined
    parent_id?: string | undefined
    is_todo?: boolean | undefined
    image_data_url?: string | undefined
  }): Promise<string> {
    return await this.tools.createNote.call(params)
  }

  async createFolder(params: { title: string; parent_id?: string | undefined }): Promise<string> {
    return await this.tools.createFolder.call(params)
  }

  async editNote(params: {
    note_id: string
    title?: string | undefined
    body?: string | undefined
    body_html?: string | undefined
    parent_id?: string | undefined
    is_todo?: boolean | undefined
    todo_completed?: boolean | undefined
    todo_due?: number | undefined
  }): Promise<string> {
    return await this.tools.editNote.call(params)
  }

  async editFolder(params: {
    folder_id: string
    title?: string | undefined
    parent_id?: string | undefined
  }): Promise<string> {
    return await this.tools.editFolder.call(params)
  }

  async deleteNote(params: { note_id: string; confirm?: boolean | undefined }): Promise<string> {
    return await this.tools.deleteNote.call(params)
  }

  async deleteFolder(params: {
    folder_id: string
    confirm?: boolean | undefined
    force?: boolean | undefined
  }): Promise<string> {
    return await this.tools.deleteFolder.call(params)
  }
}

export function initializeJoplinManager(port: number, token: string): JoplinServerManager {
  return new JoplinServerManager({ port, token })
}
