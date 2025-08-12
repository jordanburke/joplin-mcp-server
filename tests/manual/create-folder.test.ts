import dotenv from "dotenv"
import JoplinAPIClient from "../../lib/joplin-api-client.js"
import { CreateFolder, ListNotebooks } from "../../lib/tools/index.js"

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

// Create the tools
const createFolder = new CreateFolder(apiClient)
const listNotebooks = new ListNotebooks(apiClient)

// Test the create folder functionality
async function testCreateFolder(): Promise<void> {
  try {
    // Check if Joplin is available
    const available = await apiClient.serviceAvailable()
    if (!available) {
      console.error("Error: Joplin service is not available")
      process.exit(1)
    }

    // Parse command line arguments
    const args = process.argv.slice(2)
    const title = args[0] || `Test Notebook ${new Date().toISOString()}`
    const parentId = args[1] // Optional parent notebook ID

    console.log("Creating notebook with:")
    console.log(`  Title: "${title}"`)
    if (parentId) {
      console.log(`  Parent Notebook ID: "${parentId}"`)
    } else {
      console.log("  Location: Top level (no parent specified)")
    }
    console.log("")

    // Create the folder
    const createOptions: any = { title }
    if (parentId) {
      createOptions.parent_id = parentId
    }

    const result = await createFolder.call(createOptions)
    console.log(result)

    console.log("\n📋 Updated notebook hierarchy:")
    const notebooks = await listNotebooks.call()
    console.log(notebooks)
  } catch (_error) {
    console.error("Error testing:", _error)
  }
}

// Show usage if help requested
if (process.argv.includes("--help") || process.argv.includes("-h")) {
  console.log(`
Usage: tsx tests/manual/create-folder.test.ts [title] [parent_id]

Arguments:
  title     - Notebook title (optional, defaults to timestamped title)
  parent_id - ID of parent notebook to create subfolder in (optional, creates at top level if omitted)

Examples:
  tsx tests/manual/create-folder.test.ts
  tsx tests/manual/create-folder.test.ts "My Notebook"
  tsx tests/manual/create-folder.test.ts "My Subfolder" "a1b2c3d4e5f6..."

First run list_notebooks to see available notebook IDs:
  npm run test:manual:list-notebooks
`)
  process.exit(0)
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  testCreateFolder()
}
