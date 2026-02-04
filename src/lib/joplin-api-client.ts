import axios, { AxiosResponse } from "axios"

interface JoplinAPIClientConfig {
  host?: string
  port?: number
  token: string
}

interface JoplinAPIResponse<T = any> {
  items: T[]
  has_more: boolean
}

interface RequestOptions {
  query?: Record<string, any>
  [key: string]: any
}

class JoplinAPIClient {
  private readonly baseURL: string
  private readonly token: string

  constructor({ host = "127.0.0.1", port = 41184, token }: JoplinAPIClientConfig) {
    this.baseURL = `http://${host}:${port}`
    this.token = token
  }

  /**
   * Discover a running Joplin instance by scanning a range of ports in parallel.
   * Uses the /ping endpoint to detect Joplin Web Clipper service.
   *
   * @param host - The hostname to scan (default: 127.0.0.1)
   * @param startPort - The port to start scanning from (default: 41184)
   * @param maxAttempts - The maximum number of ports to try (default: 10)
   * @param timeout - Timeout in milliseconds per port check (default: 300)
   * @returns The first port with a running Joplin instance, or null if none found
   */
  static async discoverPort(
    host: string = "127.0.0.1",
    startPort: number = 41184,
    maxAttempts: number = 10,
    timeout: number = 300,
  ): Promise<number | null> {
    const endPort = startPort + maxAttempts - 1
    process.stderr.write(`🔍 Scanning for Joplin on ports ${startPort}-${endPort}...\n`)

    const ports = Array.from({ length: maxAttempts }, (_, i) => startPort + i)

    // Check all ports in parallel
    const checks = ports.map(async (port) => {
      try {
        const response: AxiosResponse<string> = await axios.get(`http://${host}:${port}/ping`, { timeout })
        if (response.status === 200 && response.data === "JoplinClipperServer") {
          return port
        }
      } catch {
        // Port not available
      }
      throw new Error("Not Joplin")
    })

    try {
      const port = await Promise.any(checks)
      process.stderr.write(`✅ Found Joplin on port ${port}\n`)
      return port
    } catch {
      return null
    }
  }

  async serviceAvailable(): Promise<boolean> {
    try {
      const response: AxiosResponse<string> = await axios.get(`${this.baseURL}/ping`)
      return response.status === 200 && response.data === "JoplinClipperServer"
    } catch (error: unknown) {
      process.stderr.write(`Error checking Joplin service availability: ${error}\n`)
      return false
    }
  }

  async getAllItems<T = any>(path: string, options: RequestOptions = {}): Promise<T[]> {
    let page = 1
    const items: T[] = []

    try {
      while (true) {
        const response = await this.get<JoplinAPIResponse<T>>(
          path,
          this.mergeRequestOptions(options, { query: { page } }),
        )

        // Validate response format
        if (!response || typeof response !== "object" || !Array.isArray(response.items)) {
          throw new Error(`Unexpected response format from Joplin API for path: ${path}`)
        }

        items.push(...response.items)
        page += 1

        if (!response.has_more) break
      }

      return items
    } catch (error: unknown) {
      process.stderr.write(`Error in getAllItems for path ${path}: ${error}\n`)
      throw error
    }
  }

  async get<T = any>(path: string, options: RequestOptions = {}): Promise<T> {
    try {
      const { data }: AxiosResponse<T> = await axios.get(`${this.baseURL}${path}`, {
        params: this.requestOptions(options).query,
      })
      return data
    } catch (error: unknown) {
      process.stderr.write(`Error in GET request for path ${path}: ${error}\n`)
      throw error
    }
  }

  async post<T = any>(path: string, body: any, options: RequestOptions = {}): Promise<T> {
    try {
      const { data }: AxiosResponse<T> = await axios.post(`${this.baseURL}${path}`, body, {
        params: this.requestOptions(options).query,
      })
      return data
    } catch (error: unknown) {
      process.stderr.write(`Error in POST request for path ${path}: ${error}\n`)
      throw error
    }
  }

  async delete<T = any>(path: string, options: RequestOptions = {}): Promise<T> {
    try {
      const { data }: AxiosResponse<T> = await axios.delete(`${this.baseURL}${path}`, {
        params: this.requestOptions(options).query,
      })
      return data
    } catch (error: unknown) {
      process.stderr.write(`Error in DELETE request for path ${path}: ${error}\n`)
      throw error
    }
  }

  async put<T = any>(path: string, body: any, options: RequestOptions = {}): Promise<T> {
    try {
      const { data }: AxiosResponse<T> = await axios.put(`${this.baseURL}${path}`, body, {
        params: this.requestOptions(options).query,
      })
      return data
    } catch (error: unknown) {
      process.stderr.write(`Error in PUT request for path ${path}: ${error}\n`)
      throw error
    }
  }

  private requestOptions(options: RequestOptions = {}): RequestOptions {
    return this.mergeRequestOptions(
      {
        query: { token: this.token },
      },
      options,
    )
  }

  private mergeRequestOptions(options1: RequestOptions, options2: RequestOptions): RequestOptions {
    return {
      query: {
        ...(options1.query || {}),
        ...(options2.query || {}),
      },
      ...this.except(options1, "query"),
      ...this.except(options2, "query"),
    }
  }

  private except(obj: Record<string, any>, key: string): Record<string, any> {
    const result = { ...obj }
    delete result[key]
    return result
  }
}

export default JoplinAPIClient
