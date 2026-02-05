import JoplinAPIClient from "./lib/joplin-api-client.js"
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

export interface JoplinServerConfig {
  host: string
  port: number
  token: string
}

export interface ConnectionStatus {
  connected: boolean
  host: string
  port: number
  message: string
}

export class JoplinServerManager {
  private apiClient: JoplinAPIClient
  private config: JoplinServerConfig
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

  getConnectionInfo(): { host: string; port: number } {
    return { host: this.config.host, port: this.config.port }
  }

  /**
   * Reconnect to Joplin with new host/port settings.
   * Reinitializes the API client and all tools.
   */
  reconnect(host: string, port: number): void {
    this.config = { ...this.config, host, port }
    this.apiClient = new JoplinAPIClient({
      host,
      port,
      token: this.config.token,
    })

    // Reinitialize tools with new client
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

  /**
   * Connect to Joplin - check status, discover, or reconnect with new settings.
   */
  async connect(params: {
    host?: string
    port?: number
    discover?: boolean
    start_port?: number
    max_attempts?: number
  }): Promise<string> {
    const { host, port, discover, start_port = 41184, max_attempts = 10 } = params
    const currentInfo = this.getConnectionInfo()

    // If discover is requested, scan for Joplin
    if (discover) {
      const targetHost = host || currentInfo.host
      const discoveredPort = await JoplinAPIClient.discoverPort(targetHost, start_port, max_attempts)

      if (discoveredPort) {
        this.reconnect(targetHost, discoveredPort)
        const isAvailable = await this.checkService()
        if (isAvailable) {
          return `✅ Connected to Joplin\n\nHost: ${targetHost}\nPort: ${discoveredPort}\nStatus: Connected`
        }
        return `⚠️ Found Joplin on port ${discoveredPort} but connection failed.\n\nPlease verify your API token is correct.`
      }
      return `❌ Could not find Joplin\n\nScanned ports ${start_port}-${start_port + max_attempts - 1} on ${targetHost}.\n\nPlease ensure:\n1. Joplin is running\n2. Web Clipper is enabled (Tools > Options > Web Clipper)\n3. The host is correct (WSL users may need the Windows IP)`
    }

    // If host or port specified, reconnect with those settings
    if (host || port) {
      const newHost = host || currentInfo.host
      const newPort = port || currentInfo.port
      this.reconnect(newHost, newPort)
      const isAvailable = await this.checkService()
      if (isAvailable) {
        return `✅ Connected to Joplin\n\nHost: ${newHost}\nPort: ${newPort}\nStatus: Connected`
      }
      return `❌ Connection failed\n\nCould not connect to Joplin at ${newHost}:${newPort}.\n\nPlease ensure:\n1. Joplin is running\n2. Web Clipper is enabled\n3. The host and port are correct\n4. The API token is valid`
    }

    // Just check current connection status
    const isAvailable = await this.checkService()
    if (isAvailable) {
      return `✅ Connected to Joplin\n\nHost: ${currentInfo.host}\nPort: ${currentInfo.port}\nStatus: Connected`
    }
    return `❌ Not connected\n\nCurrent settings:\nHost: ${currentInfo.host}\nPort: ${currentInfo.port}\nStatus: Disconnected\n\nTry:\n- connect with discover=true to scan for Joplin\n- connect with host/port to specify connection settings`
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

export function initializeJoplinManager(host: string, port: number, token: string): JoplinServerManager {
  return new JoplinServerManager({ host, port, token })
}
