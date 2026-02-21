import axios, { type AxiosResponse } from "axios"
import { Either, Left, Right } from "functype"

type JoplinAPIClientConfig = {
  host?: string
  port?: number
  token: string
}

type JoplinAPIResponse<T = unknown> = {
  items: T[]
  has_more: boolean
}

type RequestOptions = {
  query?: Record<string, unknown>
  [key: string]: unknown
}

class JoplinAPIClient {
  private readonly baseURL: string
  private readonly token: string

  constructor({ host = "127.0.0.1", port = 41184, token }: JoplinAPIClientConfig) {
    this.baseURL = `http://${host}:${port}`
    this.token = token
  }

  async serviceAvailable(): Promise<Either<Error, true>> {
    try {
      const response: AxiosResponse<string> = await axios.get(`${this.baseURL}/ping`, { timeout: 5_000 })
      if (response.status === 200 && response.data === "JoplinClipperServer") {
        return Right(true as const)
      }
      return Left(new Error("Unexpected response from Joplin ping"))
    } catch (error: unknown) {
      return Left(error instanceof Error ? error : new Error(String(error)))
    }
  }

  async getAllItems<T = unknown>(path: string, options: RequestOptions = {}): Promise<Either<Error, T[]>> {
    let page = 1
    const items: T[] = []

    try {
      while (true) {
        const result = await this.get<JoplinAPIResponse<T>>(
          path,
          this.mergeRequestOptions(options, { query: { page } }),
        )

        const response = result.fold(
          (err) => {
            throw err
          },
          (data) => data,
        )

        if (!response || typeof response !== "object" || !Array.isArray(response.items)) {
          return Left(new Error(`Unexpected response format from Joplin API for path: ${path}`))
        }

        items.push(...response.items)
        page += 1

        if (!response.has_more) break
      }

      return Right(items)
    } catch (error: unknown) {
      process.stderr.write(`Error in getAllItems for path ${path}: ${error}\n`)
      return Left(error instanceof Error ? error : new Error(String(error)))
    }
  }

  async get<T = unknown>(path: string, options: RequestOptions = {}): Promise<Either<Error, T>> {
    try {
      const { data }: AxiosResponse<T> = await axios.get(`${this.baseURL}${path}`, {
        params: this.requestOptions(options).query,
        timeout: 30_000,
      })
      return Right(data)
    } catch (error: unknown) {
      return Left(error instanceof Error ? error : new Error(String(error)))
    }
  }

  async post<T = unknown>(path: string, body: unknown, options: RequestOptions = {}): Promise<Either<Error, T>> {
    try {
      const { data }: AxiosResponse<T> = await axios.post(`${this.baseURL}${path}`, body, {
        params: this.requestOptions(options).query,
        timeout: 30_000,
      })
      return Right(data)
    } catch (error: unknown) {
      return Left(error instanceof Error ? error : new Error(String(error)))
    }
  }

  async delete<T = unknown>(path: string, options: RequestOptions = {}): Promise<Either<Error, T>> {
    try {
      const { data }: AxiosResponse<T> = await axios.delete(`${this.baseURL}${path}`, {
        params: this.requestOptions(options).query,
        timeout: 30_000,
      })
      return Right(data)
    } catch (error: unknown) {
      return Left(error instanceof Error ? error : new Error(String(error)))
    }
  }

  async put<T = unknown>(path: string, body: unknown, options: RequestOptions = {}): Promise<Either<Error, T>> {
    try {
      const { data }: AxiosResponse<T> = await axios.put(`${this.baseURL}${path}`, body, {
        params: this.requestOptions(options).query,
        timeout: 30_000,
      })
      return Right(data)
    } catch (error: unknown) {
      return Left(error instanceof Error ? error : new Error(String(error)))
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

  private except(obj: Record<string, unknown>, key: string): Record<string, unknown> {
    const result = { ...obj }
    delete result[key]
    return result
  }
}

export default JoplinAPIClient
export type { JoplinAPIClientConfig, JoplinAPIResponse, RequestOptions }
