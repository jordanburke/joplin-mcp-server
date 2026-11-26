import type { Either, HttpError, HttpMethod, HttpResponse } from "functype"
import { Http, Left, Right, TimeoutError } from "functype"

type JoplinAPIClientConfig = {
  host?: string
  port?: number
  token: string
  /** The fetch to send requests with. Defaults to the global fetch; tests pass a stub. */
  fetch?: typeof globalThis.fetch
}

type JoplinAPIResponse<T = unknown> = {
  items: T[]
  has_more: boolean
}

type QueryParams = Record<string, string | number | boolean | undefined>

type RequestOptions = {
  query?: QueryParams
}

const PING_TIMEOUT_MS = 5_000
const REQUEST_TIMEOUT_MS = 30_000

/**
 * A failed request to the Joplin API. `path` is the API path requested, without its query string.
 * `status` and `data` are set when Joplin answered with an error status: `data` is the parsed body,
 * which for Joplin is usually `{ error: "..." }`.
 *
 * Neither the message nor `path` holds the full URL, because the API token travels in its query string.
 */
class JoplinRequestError extends Error {
  readonly path: string
  readonly status: number | undefined
  readonly data: unknown

  constructor(message: string, path: string, status?: number, data?: unknown) {
    super(message)
    this.name = "JoplinRequestError"
    this.path = path
    this.status = status
    this.data = data
  }
}

/** The HTTP status Joplin answered a failed request with, if it answered at all. */
const statusOf = (error: unknown): number | undefined =>
  error instanceof JoplinRequestError ? error.status : undefined

/** The API path of a failed request, without its query string. */
const pathOf = (error: unknown): string | undefined => (error instanceof JoplinRequestError ? error.path : undefined)

/** The `error` message from Joplin's body for a failed request, if it sent one. */
const joplinErrorOf = (error: unknown): string | undefined => {
  if (!(error instanceof JoplinRequestError)) return undefined
  const { data } = error
  if (data !== null && typeof data === "object" && "error" in data) {
    const message = (data as { error: unknown }).error
    if (typeof message === "string" && message.length > 0) return message
  }
  return undefined
}

const parseBody = (body: string): unknown => {
  try {
    return JSON.parse(body) as unknown
  } catch {
    return body
  }
}

const causeMessage = (cause: unknown): string => {
  if (!(cause instanceof Error)) return String(cause)
  // Node's fetch fails with "fetch failed" and keeps the reason (e.g. ECONNREFUSED) in `cause`.
  const inner = cause.cause instanceof Error ? `: ${cause.cause.message}` : ""
  return `${cause.message}${inner}`
}

const toRequestError = (error: HttpError | TimeoutError, path: string, timeoutMs: number): JoplinRequestError => {
  if (error instanceof TimeoutError) return new JoplinRequestError(`timeout of ${timeoutMs}ms exceeded`, path)
  switch (error._tag) {
    case "HttpStatusError":
      return new JoplinRequestError(
        `Request failed with status code ${error.status}`,
        path,
        error.status,
        parseBody(error.body),
      )
    case "DecodeError":
      return new JoplinRequestError(
        `Joplin sent a response that could not be parsed: ${causeMessage(error.cause)}`,
        path,
      )
    case "NetworkError":
      return new JoplinRequestError(causeMessage(error.cause), path)
  }
}

class JoplinAPIClient {
  private readonly baseURL: string
  private readonly token: string
  private readonly http: ReturnType<typeof Http.client>

  constructor({ host = "127.0.0.1", port = 41184, token, fetch }: JoplinAPIClientConfig) {
    this.baseURL = `http://${host}:${port}`
    this.token = token
    this.http = Http.client({ baseUrl: this.baseURL, ...(fetch ? { fetch } : {}) })
  }

  async serviceAvailable(): Promise<Either<Error, true>> {
    const result = await this.send<string>("GET", "/ping", { timeoutMs: PING_TIMEOUT_MS, withToken: false })
    return result.flatMap((data) =>
      data === "JoplinClipperServer"
        ? Right<Error, true>(true)
        : Left<Error, true>(new Error("Unexpected response from Joplin ping")),
    )
  }

  async getAllItems<T = unknown>(path: string, options: RequestOptions = {}): Promise<Either<Error, T[]>> {
    const fetchPage = async (page: number, acc: T[]): Promise<Either<Error, T[]>> => {
      const result = await this.get<JoplinAPIResponse<T>>(path, { query: { ...options.query, page } })
      return result
        .flatMap((response) =>
          Array.isArray(response.items)
            ? Right<Error, JoplinAPIResponse<T>>(response)
            : Left<Error, JoplinAPIResponse<T>>(
                new Error(`Unexpected response format from Joplin API for path: ${path}`),
              ),
        )
        .fold(
          (error) => Promise.resolve(Left<Error, T[]>(error)),
          (response) => {
            const combined = [...acc, ...response.items]
            return response.has_more ? fetchPage(page + 1, combined) : Promise.resolve(Right<Error, T[]>(combined))
          },
        )
    }

    const result = await fetchPage(1, [])
    if (result.isLeft()) process.stderr.write(`Error in getAllItems for path ${path}: ${result.value.message}\n`)
    return result
  }

  get<T = unknown>(path: string, options: RequestOptions = {}): Promise<Either<Error, T>> {
    return this.send<T>("GET", path, { query: options.query })
  }

  post<T = unknown>(path: string, body: unknown, options: RequestOptions = {}): Promise<Either<Error, T>> {
    return this.send<T>("POST", path, { body, query: options.query })
  }

  delete<T = unknown>(path: string, options: RequestOptions = {}): Promise<Either<Error, T>> {
    return this.send<T>("DELETE", path, { query: options.query })
  }

  put<T = unknown>(path: string, body: unknown, options: RequestOptions = {}): Promise<Either<Error, T>> {
    return this.send<T>("PUT", path, { body, query: options.query })
  }

  private async send<T>(
    method: HttpMethod,
    path: string,
    {
      body,
      query,
      timeoutMs = REQUEST_TIMEOUT_MS,
      withToken = true,
    }: { body?: unknown; query?: QueryParams; timeoutMs?: number; withToken?: boolean },
  ): Promise<Either<Error, T>> {
    const params = withToken ? { ...query, token: this.token } : query
    const request = this.http
      .request<T>({ method, url: path, body, ...(params ? { params } : {}) })
      .timeout(timeoutMs)
      .map((response: HttpResponse<T>) => response.data)
      .mapError((error) => toRequestError(error, path, timeoutMs))
    try {
      return await request.run()
    } catch (defect: unknown) {
      // run() rejects only on a defect, a bug rather than a failed request. Report it the same way.
      return Left(defect instanceof Error ? defect : new Error(String(defect)))
    }
  }
}

export default JoplinAPIClient
export { joplinErrorOf, JoplinRequestError, pathOf, statusOf }
export type { JoplinAPIClientConfig, JoplinAPIResponse, RequestOptions }
