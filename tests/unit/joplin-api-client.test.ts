import { describe, it, expect, beforeEach, vi } from "vitest"
import { Either } from "functype"

import JoplinAPIClient, {
  joplinErrorOf,
  JoplinRequestError,
  pathOf,
  statusOf,
} from "../../src/lib/joplin-api-client.js"

const json = (data: unknown, status = 200): Response =>
  new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json" } })

const text = (body: string, status = 200): Response =>
  new Response(body, { status, headers: { "content-type": "text/plain" } })

type FetchCall = { url: URL; method: string; body: string | undefined; headers: Record<string, string> }

const callOf = (mock: ReturnType<typeof vi.fn>, index = 0): FetchCall => {
  const [url, init] = mock.mock.calls[index] as [string, RequestInit]
  return {
    url: new URL(url),
    method: init.method ?? "GET",
    body: init.body as string | undefined,
    headers: init.headers as Record<string, string>,
  }
}

const leftOf = <T>(result: Either<Error, T>): Error =>
  result.fold(
    (err) => err,
    () => {
      throw new Error("Expected Left")
    },
  )

const rightOf = <T>(result: Either<Error, T>): T =>
  result.fold(
    (err) => {
      throw new Error(`Expected Right, got ${err.message}`)
    },
    (value) => value,
  )

describe("JoplinAPIClient", () => {
  let fetchMock: ReturnType<typeof vi.fn>
  let client: JoplinAPIClient

  beforeEach(() => {
    fetchMock = vi.fn()
    client = new JoplinAPIClient({ port: 41184, token: "test-token", fetch: fetchMock as typeof fetch })
  })

  describe("constructor", () => {
    it("should create client with default host and port", () => {
      const defaultClient = new JoplinAPIClient({ token: "test-token" })
      expect((defaultClient as any).baseURL).toBe("http://127.0.0.1:41184")
      expect((defaultClient as any).token).toBe("test-token")
    })

    it("should create client with custom host and port", () => {
      const custom = new JoplinAPIClient({ host: "10.0.0.5", port: 41185, token: "t" })
      expect((custom as any).baseURL).toBe("http://10.0.0.5:41185")
    })
  })

  describe("serviceAvailable", () => {
    it("should return Right(true) when service is available", async () => {
      fetchMock.mockResolvedValue(text("JoplinClipperServer"))

      const result = await client.serviceAvailable()

      expect(Either.isRight(result)).toBe(true)
      const call = callOf(fetchMock)
      expect(call.url.href).toBe("http://127.0.0.1:41184/ping")
      expect(call.url.searchParams.has("token")).toBe(false)
    })

    it("should return Left when service is not available", async () => {
      fetchMock.mockRejectedValue(new TypeError("fetch failed", { cause: new Error("connect ECONNREFUSED") }))

      const result = await client.serviceAvailable()

      expect(leftOf(result).message).toBe("fetch failed: connect ECONNREFUSED")
    })

    it("should return Left when response is incorrect", async () => {
      fetchMock.mockResolvedValue(text("Wrong response"))

      const result = await client.serviceAvailable()

      expect(leftOf(result).message).toBe("Unexpected response from Joplin ping")
    })
  })

  describe("get", () => {
    it("should return Right with data on successful GET request", async () => {
      const mockData = { items: [], has_more: false }
      fetchMock.mockResolvedValue(json(mockData))

      const result = await client.get("/folders")

      expect(rightOf(result)).toEqual(mockData)
      const call = callOf(fetchMock)
      expect(call.method).toBe("GET")
      expect(call.url.pathname).toBe("/folders")
      expect(Object.fromEntries(call.url.searchParams)).toEqual({ token: "test-token" })
    })

    it("should send additional query params with the token", async () => {
      fetchMock.mockResolvedValue(json({ items: [], has_more: false }))

      await client.get("/folders", { query: { limit: 10, fields: "id,title" } })

      expect(Object.fromEntries(callOf(fetchMock).url.searchParams)).toEqual({
        token: "test-token",
        limit: "10",
        fields: "id,title",
      })
    })

    it("should return Left on a network error", async () => {
      fetchMock.mockRejectedValue(new Error("Network error"))

      const result = await client.get("/folders")

      expect(leftOf(result).message).toBe("Network error")
    })

    it("should carry status, path and body on an error status, and keep the token out of both", async () => {
      fetchMock.mockResolvedValue(json({ error: "Not Found" }, 404))

      const result = await client.get("/notes/abc")

      const error = leftOf(result)
      expect(error).toBeInstanceOf(JoplinRequestError)
      expect(error.message).toBe("Request failed with status code 404")
      expect(statusOf(error)).toBe(404)
      expect(pathOf(error)).toBe("/notes/abc")
      expect(joplinErrorOf(error)).toBe("Not Found")
      expect(error.message).not.toContain("test-token")
      expect(pathOf(error)).not.toContain("test-token")
    })

    it("should redact the token from a message fetch itself produces", async () => {
      fetchMock.mockRejectedValue(
        new TypeError("Failed to parse URL from http://::1:41184/notes?token=test-token: Invalid URL"),
      )

      const result = await client.get("/notes")

      const message = leftOf(result).message
      expect(message).not.toContain("test-token")
      expect(message).toContain("token=<redacted>")
    })

    it("should redact a token that the URL encodes", async () => {
      const odd = new JoplinAPIClient({ token: "a b+c/=", fetch: fetchMock as typeof fetch })
      fetchMock.mockRejectedValue(new TypeError("Failed to parse URL from http://x/notes?token=a+b%2Bc%2F%3D"))

      const message = leftOf(await odd.get("/notes")).message

      expect(message).toBe("Failed to parse URL from http://x/notes?token=<redacted>")
    })

    it("should return Left with a timeout message when Joplin does not answer", async () => {
      vi.useFakeTimers()
      try {
        fetchMock.mockImplementation(
          (_url: string, init: RequestInit) =>
            new Promise((_resolve, reject) => {
              init.signal?.addEventListener("abort", () => reject(new Error("aborted")))
            }),
        )

        const pending = client.get("/folders")
        await vi.advanceTimersByTimeAsync(30_000)
        const result = await pending

        expect(leftOf(result).message).toBe("timeout of 30000ms exceeded")
      } finally {
        vi.useRealTimers()
      }
    })
  })

  describe("post", () => {
    it("should send a JSON body and return Right with data", async () => {
      const mockData = { id: "123", title: "Test Note" }
      const requestBody = { title: "Test Note", body: "Test content" }
      fetchMock.mockResolvedValue(json(mockData))

      const result = await client.post("/notes", requestBody)

      expect(rightOf(result)).toEqual(mockData)
      const call = callOf(fetchMock)
      expect(call.method).toBe("POST")
      expect(call.url.pathname).toBe("/notes")
      expect(call.url.searchParams.get("token")).toBe("test-token")
      expect(call.headers["Content-Type"]).toBe("application/json")
      expect(JSON.parse(call.body ?? "")).toEqual(requestBody)
    })

    it("should return Left on POST error", async () => {
      fetchMock.mockResolvedValue(json({ error: "Server error" }, 500))

      const result = await client.post("/notes", {})

      expect(statusOf(leftOf(result))).toBe(500)
    })
  })

  describe("put and delete", () => {
    it("should PUT a JSON body", async () => {
      fetchMock.mockResolvedValue(json({ id: "1", title: "New" }))

      const result = await client.put("/notes/1", { title: "New" })

      expect(rightOf(result)).toEqual({ id: "1", title: "New" })
      expect(callOf(fetchMock).method).toBe("PUT")
    })

    it("should treat Joplin's empty text/plain DELETE response as success", async () => {
      fetchMock.mockResolvedValue(text(""))

      const result = await client.delete("/notes/1")

      expect(rightOf(result)).toBe("")
      expect(callOf(fetchMock).method).toBe("DELETE")
    })
  })

  describe("getAllItems", () => {
    it("should return Right with all paginated items", async () => {
      fetchMock
        .mockResolvedValueOnce(json({ items: [{ id: "1", title: "Item 1" }], has_more: true }))
        .mockResolvedValueOnce(json({ items: [{ id: "2", title: "Item 2" }], has_more: false }))

      const result = await client.getAllItems("/folders", { query: { fields: "id,title" } })

      expect(rightOf(result)).toEqual([
        { id: "1", title: "Item 1" },
        { id: "2", title: "Item 2" },
      ])
      expect(fetchMock).toHaveBeenCalledTimes(2)
      expect(callOf(fetchMock, 0).url.searchParams.get("page")).toBe("1")
      expect(callOf(fetchMock, 1).url.searchParams.get("page")).toBe("2")
      expect(callOf(fetchMock, 1).url.searchParams.get("fields")).toBe("id,title")
    })

    it("should return Left on invalid response format", async () => {
      fetchMock.mockResolvedValue(json("invalid response"))

      const result = await client.getAllItems("/folders")

      expect(leftOf(result).message).toContain("Unexpected response format")
    })

    it("should return Left when a page fails", async () => {
      fetchMock.mockResolvedValue(json({ error: "Forbidden" }, 403))

      const result = await client.getAllItems("/folders")

      expect(statusOf(leftOf(result))).toBe(403)
    })
  })
})
