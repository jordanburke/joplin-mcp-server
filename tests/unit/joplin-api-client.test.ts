import { describe, it, expect, beforeEach, vi } from "vitest"
import JoplinAPIClient from "../../lib/joplin-api-client.js"

// Mock axios
vi.mock("axios", () => {
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
    it("should return true when service is available", async () => {
      ;(axios.get as any).mockResolvedValue({
        status: 200,
        data: "JoplinClipperServer",
      })

      const result = await client.serviceAvailable()

      expect(result).toBe(true)
      expect(axios.get).toHaveBeenCalledWith("http://127.0.0.1:41184/ping")
    })

    it("should return false when service is not available", async () => {
      ;(axios.get as any).mockRejectedValue(new Error("Connection failed"))

      const result = await client.serviceAvailable()

      expect(result).toBe(false)
    })

    it("should return false when response is incorrect", async () => {
      ;(axios.get as any).mockResolvedValue({
        status: 200,
        data: "Wrong response",
      })

      const result = await client.serviceAvailable()

      expect(result).toBe(false)
    })
  })

  describe("get", () => {
    it("should make GET request with token", async () => {
      const mockData = { items: [], has_more: false }
      ;(axios.get as any).mockResolvedValue({ data: mockData })

      const result = await client.get("/folders")

      expect(result).toEqual(mockData)
      expect(axios.get).toHaveBeenCalledWith("http://127.0.0.1:41184/folders", { params: { token: "test-token" } })
    })

    it("should make GET request with additional query params", async () => {
      const mockData = { items: [], has_more: false }
      ;(axios.get as any).mockResolvedValue({ data: mockData })

      const result = await client.get("/folders", {
        query: { limit: 10, fields: "id,title" },
      })

      expect(result).toEqual(mockData)
      expect(axios.get).toHaveBeenCalledWith("http://127.0.0.1:41184/folders", {
        params: {
          token: "test-token",
          limit: 10,
          fields: "id,title",
        },
      })
    })
  })

  describe("post", () => {
    it("should make POST request with token", async () => {
      const mockData = { id: "123", title: "Test Note" }
      const requestBody = { title: "Test Note", body: "Test content" }
      ;(axios.post as any).mockResolvedValue({ data: mockData })

      const result = await client.post("/notes", requestBody)

      expect(result).toEqual(mockData)
      expect(axios.post).toHaveBeenCalledWith("http://127.0.0.1:41184/notes", requestBody, {
        params: { token: "test-token" },
      })
    })
  })

  describe("getAllItems", () => {
    it("should fetch all paginated items", async () => {
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

      expect(result).toEqual([
        { id: "1", title: "Item 1" },
        { id: "2", title: "Item 2" },
      ])
      expect(axios.get).toHaveBeenCalledTimes(2)
    })

    it("should throw error on invalid response format", async () => {
      ;(axios.get as any).mockResolvedValue({ data: "invalid response" })

      await expect(client.getAllItems("/folders")).rejects.toThrow(
        "Unexpected response format from Joplin API for path: /folders",
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

  describe("error handling", () => {
    it("should handle GET errors", async () => {
      const error = new Error("Network error")
      ;(axios.get as any).mockRejectedValue(error)

      await expect(client.get("/folders")).rejects.toThrow("Network error")
    })

    it("should handle POST errors", async () => {
      const error = new Error("Server error")
      ;(axios.post as any).mockRejectedValue(error)

      await expect(client.post("/notes", {})).rejects.toThrow("Server error")
    })
  })
})
