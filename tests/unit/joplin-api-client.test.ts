import { describe, it, expect, beforeEach, vi } from "vitest"
import { Either } from "functype"
import JoplinAPIClient from "../../src/lib/joplin-api-client.js"

// Mock axios
vi.mock("axios", function () {
  const mockAxios = {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  }
  return { default: mockAxios }
})

import axios from "axios"

describe("JoplinAPIClient", () => {
  let client: JoplinAPIClient

  beforeEach(() => {
    vi.clearAllMocks()
    client = new JoplinAPIClient({
      port: 41184,
      token: "test-token",
    })
  })

  describe("constructor", () => {
    it("should create client with default port", () => {
      const defaultClient = new JoplinAPIClient({ token: "test-token" })
      expect((defaultClient as any).baseURL).toBe("http://127.0.0.1:41184")
      expect((defaultClient as any).token).toBe("test-token")
    })

    it("should create client with custom port", () => {
      expect((client as any).baseURL).toBe("http://127.0.0.1:41184")
      expect((client as any).token).toBe("test-token")
    })
  })

  describe("serviceAvailable", () => {
    it("should return Right(true) when service is available", async () => {
      ;(axios.get as any).mockResolvedValue({
        status: 200,
        data: "JoplinClipperServer",
      })

      const result = await client.serviceAvailable()

      expect(Either.isRight(result)).toBe(true)
      expect(axios.get).toHaveBeenCalledWith("http://127.0.0.1:41184/ping", { timeout: 5_000 })
    })

    it("should return Left when service is not available", async () => {
      ;(axios.get as any).mockRejectedValue(new Error("Connection failed"))

      const result = await client.serviceAvailable()

      expect(Either.isLeft(result)).toBe(true)
    })

    it("should return Left when response is incorrect", async () => {
      ;(axios.get as any).mockResolvedValue({
        status: 200,
        data: "Wrong response",
      })

      const result = await client.serviceAvailable()

      expect(Either.isLeft(result)).toBe(true)
    })
  })

  describe("get", () => {
    it("should return Right with data on successful GET request", async () => {
      const mockData = { items: [], has_more: false }
      ;(axios.get as any).mockResolvedValue({ data: mockData })

      const result = await client.get("/folders")

      expect(Either.isRight(result)).toBe(true)
      result.fold(
        () => {
          throw new Error("Expected Right")
        },
        (data) => expect(data).toEqual(mockData),
      )
      expect(axios.get).toHaveBeenCalledWith("http://127.0.0.1:41184/folders", {
        params: { token: "test-token" },
        timeout: 30_000,
      })
    })

    it("should return Right with data on GET request with additional query params", async () => {
      const mockData = { items: [], has_more: false }
      ;(axios.get as any).mockResolvedValue({ data: mockData })

      const result = await client.get("/folders", {
        query: { limit: 10, fields: "id,title" },
      })

      expect(Either.isRight(result)).toBe(true)
      expect(axios.get).toHaveBeenCalledWith("http://127.0.0.1:41184/folders", {
        params: {
          token: "test-token",
          limit: 10,
          fields: "id,title",
        },
        timeout: 30_000,
      })
    })

    it("should return Left on GET error", async () => {
      const error = new Error("Network error")
      ;(axios.get as any).mockRejectedValue(error)

      const result = await client.get("/folders")

      expect(Either.isLeft(result)).toBe(true)
      result.fold(
        (err) => expect(err.message).toBe("Network error"),
        () => {
          throw new Error("Expected Left")
        },
      )
    })
  })

  describe("post", () => {
    it("should return Right with data on successful POST request", async () => {
      const mockData = { id: "123", title: "Test Note" }
      const requestBody = { title: "Test Note", body: "Test content" }
      ;(axios.post as any).mockResolvedValue({ data: mockData })

      const result = await client.post("/notes", requestBody)

      expect(Either.isRight(result)).toBe(true)
      result.fold(
        () => {
          throw new Error("Expected Right")
        },
        (data) => expect(data).toEqual(mockData),
      )
      expect(axios.post).toHaveBeenCalledWith("http://127.0.0.1:41184/notes", requestBody, {
        params: { token: "test-token" },
        timeout: 30_000,
      })
    })

    it("should return Left on POST error", async () => {
      const error = new Error("Server error")
      ;(axios.post as any).mockRejectedValue(error)

      const result = await client.post("/notes", {})

      expect(Either.isLeft(result)).toBe(true)
    })
  })

  describe("getAllItems", () => {
    it("should return Right with all paginated items", async () => {
      const page1 = {
        items: [{ id: "1", title: "Item 1" }],
        has_more: true,
      }
      const page2 = {
        items: [{ id: "2", title: "Item 2" }],
        has_more: false,
      }

      ;(axios.get as any).mockResolvedValueOnce({ data: page1 }).mockResolvedValueOnce({ data: page2 })

      const result = await client.getAllItems("/folders")

      expect(Either.isRight(result)).toBe(true)
      result.fold(
        () => {
          throw new Error("Expected Right")
        },
        (items) =>
          expect(items).toEqual([
            { id: "1", title: "Item 1" },
            { id: "2", title: "Item 2" },
          ]),
      )
      expect(axios.get).toHaveBeenCalledTimes(2)
    })

    it("should return Left on invalid response format", async () => {
      ;(axios.get as any).mockResolvedValue({ data: "invalid response" })

      const result = await client.getAllItems("/folders")

      expect(Either.isLeft(result)).toBe(true)
      result.fold(
        (err) => expect(err.message).toContain("Unexpected response format"),
        () => {
          throw new Error("Expected Left")
        },
      )
    })
  })

  describe("requestOptions", () => {
    it("should merge options correctly", () => {
      const options = (client as any).requestOptions({
        query: { limit: 10 },
      })

      expect(options).toEqual({
        query: {
          token: "test-token",
          limit: 10,
        },
      })
    })

    it("should handle empty options", () => {
      const options = (client as any).requestOptions()

      expect(options).toEqual({
        query: {
          token: "test-token",
        },
      })
    })
  })
})
