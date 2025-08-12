import dotenv from "dotenv"
import JoplinAPIClient from "../../lib/joplin-api-client.js"
import { SearchNotes } from "../../lib/tools/index.js"

// Load environment variables
dotenv.config()

// Check for required environment variables
const requiredEnvVars = ["JOPLIN_PORT", "JOPLIN_TOKEN"] as const
for (const envVar of requiredEnvVars) {
  if (!process.env[envVar]) {
    console.error(`Error: ${envVar} environment variable is required`)
    process.exit(1)
  }
}

// Create the Joplin API client
const apiClient = new JoplinAPIClient({
  port: parseInt(process.env.JOPLIN_PORT!),
  token: process.env.JOPLIN_TOKEN!,
})

// Create the search tool
const searchNotes = new SearchNotes(apiClient)

// Test the search functionality
async function testSearch(): Promise<void> {
  try {
    // Check if Joplin is available
    const available = await apiClient.serviceAvailable()
    if (!available) {
      console.error("Error: Joplin service is not available")
      process.exit(1)
    }

    // Perform a search
    const query = process.argv[2] || "test"
    console.log(`Searching for: "${query}"`)

    const result = await searchNotes.call(query)
    console.log(result)
  } catch (_error) {
    console.error("Error testing:", _error)
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  testSearch()
}
