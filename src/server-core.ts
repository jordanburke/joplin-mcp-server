import { Either } from "functype"

import JoplinAPIClient from "./lib/joplin-api-client.js"
import type { JoplinSidecar } from "./lib/joplin-sidecar.js"
import {
  CreateFolder,
  CreateNote,
  DeleteFolder,
  DeleteNote,
  EditFolder,
  EditNote,
  ListNotebooks,
  ReadMultiNote,
  ReadNote,
  ReadNotebook,
  SearchNotes,
} from "./lib/tools/index.js"

export type JoplinServerConfig = {
  host: string
  port: number
  token: string
  sidecar?: JoplinSidecar
}

export class JoplinServerManager {
  private apiClient: JoplinAPIClient
  private config: JoplinServerConfig
  private connected: boolean = false
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
    this.config = config
    this.apiClient = new JoplinAPIClient({
      host: config.host,
      port: config.port,
      token: config.token,
    })

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

  async ensureConnected(): Promise<void> {
    if (this.connected) {
      const result = await this.apiClient.serviceAvailable()
      if (Either.isRight(result)) return
      this.connected = false
    }

    const available = await this.apiClient.serviceAvailable()
    if (Either.isRight(available)) {
      this.connected = true
      process.stderr.write(`Connected to Joplin at ${this.config.host}:${this.config.port}\n`)
      return
    }

    // If sidecar exists, try starting it
    if (this.config.sidecar) {
      process.stderr.write("Joplin not available, starting sidecar...\n")
      const startResult = await this.config.sidecar.start()
      if (Either.isLeft(startResult)) {
        const error = startResult.fold(
          (e) => e,
          () => null as never,
        )
        throw new Error(`Sidecar failed [${error.code}]: ${error.message}`)
      }
      const retryAvailable = await this.apiClient.serviceAvailable()
      if (Either.isRight(retryAvailable)) {
        this.connected = true
        process.stderr.write(`Connected to Joplin via sidecar at ${this.config.host}:${this.config.port}\n`)
        return
      }
    }

    throw new Error(
      `Joplin is not available at ${this.config.host}:${this.config.port}. ` +
        `Please ensure Joplin is running or configure a sidecar.`,
    )
  }

  // Tool execution methods
  async listNotebooks(): Promise<string> {
    await this.ensureConnected()
    return await this.tools.listNotebooks.call()
  }

  async searchNotes(query: string): Promise<string> {
    await this.ensureConnected()
    return await this.tools.searchNotes.call(query)
  }

  async readNotebook(notebookId: string): Promise<string> {
    await this.ensureConnected()
    return await this.tools.readNotebook.call(notebookId)
  }

  async readNote(noteId: string): Promise<string> {
    await this.ensureConnected()
    return await this.tools.readNote.call(noteId)
  }

  async readMultiNote(noteIds: string[]): Promise<string> {
    await this.ensureConnected()
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
    await this.ensureConnected()
    return await this.tools.createNote.call(params)
  }

  async createFolder(params: { title: string; parent_id?: string | undefined }): Promise<string> {
    await this.ensureConnected()
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
    await this.ensureConnected()
    return await this.tools.editNote.call(params)
  }

  async editFolder(params: {
    folder_id: string
    title?: string | undefined
    parent_id?: string | undefined
  }): Promise<string> {
    await this.ensureConnected()
    return await this.tools.editFolder.call(params)
  }

  async deleteNote(params: { note_id: string; confirm?: boolean | undefined }): Promise<string> {
    await this.ensureConnected()
    return await this.tools.deleteNote.call(params)
  }

  async deleteFolder(params: {
    folder_id: string
    confirm?: boolean | undefined
    force?: boolean | undefined
  }): Promise<string> {
    await this.ensureConnected()
    return await this.tools.deleteFolder.call(params)
  }

  async sync(): Promise<string> {
    if (!this.config.sidecar) {
      return "Sync not available in external mode. Sync is managed by your Joplin instance directly."
    }
    const result = await this.config.sidecar.sync()
    return result.fold(
      (error) => `Sync failed: ${error.message}`,
      (output) => `Sync completed successfully.\n\n${output}`,
    )
  }
}

export function initializeJoplinManager(config: JoplinServerConfig): JoplinServerManager {
  return new JoplinServerManager(config)
}
