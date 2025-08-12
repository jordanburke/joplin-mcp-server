import dotenv from "dotenv"
import JoplinAPIClient from "../../lib/joplin-api-client.js"
import { EditFolder, ListNotebooks, ReadNotebook } from "../../lib/tools/index.js"

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
const editFolder = new EditFolder(apiClient)
const listNotebooks = new ListNotebooks(apiClient)
const readNotebook = new ReadNotebook(apiClient)

// Test the edit folder functionality
async function testEditFolder(): Promise<void> {
  try {
    // Check if Joplin is available
    const available = await apiClient.serviceAvailable()
    if (!available) {
      console.error("Error: Joplin service is not available")
      process.exit(1)
    }

    // Parse command line arguments
    const args = process.argv.slice(2)
    const folderId = args[0]

    if (!folderId) {
      console.log("No folder ID provided. Listing available notebooks:")
      const notebooks = await listNotebooks.call()
      console.log(notebooks)
      console.log("\nPlease run again with a folder ID from the list above.")
      console.log("Usage: tsx tests/manual/edit-folder.test.ts <folder_id> [field=value] [field=value]...")
      console.log("\nExamples:")
      console.log('  tsx tests/manual/edit-folder.test.ts abc123 title="New Name"')
      console.log('  tsx tests/manual/edit-folder.test.ts abc123 title="Subfolder" parent_id="def456"')
      process.exit(0)
    }

    // Parse edit parameters from remaining arguments
    const editOptions: any = { folder_id: folderId }

    for (let i = 1; i < args.length; i++) {
      const arg = args[i]
      const [key, value] = arg.split("=", 2)

      if (!value) {
        console.error(`Invalid argument: ${arg}. Use format key=value`)
        continue
      }

      // Remove quotes if present
      editOptions[key] = value.replace(/^["']|["']$/g, "")
    }

    console.log("📁 Current notebook:")
    const currentNotebook = await readNotebook.call(folderId)
    console.log(currentNotebook)
    console.log("\n" + "=".repeat(80) + "\n")

    console.log("🔄 Editing notebook with:")
    Object.entries(editOptions).forEach(([key, value]) => {
      if (key !== "folder_id") {
        console.log(`  ${key}: ${JSON.stringify(value)}`)
      }
    })
    console.log("")

    const result = await editFolder.call(editOptions)
    console.log(result)

    console.log("\n📋 Updated notebook hierarchy:")
    const updatedNotebooks = await listNotebooks.call()
    console.log(updatedNotebooks)
  } catch (_error) {
    console.error("Error testing:", _error)
  }
}

// Show usage if help requested
if (process.argv.includes("--help") || process.argv.includes("-h")) {
  console.log(`
Usage: tsx tests/manual/edit-folder.test.ts <folder_id> [field=value] [field=value]...

Arguments:
  folder_id - ID of the folder/notebook to edit (required)
  
Available fields:
  title="New Name"           - Update folder title
  parent_id="parent_id"      - Move to different parent folder

Examples:
  tsx tests/manual/edit-folder.test.ts abc123 title="New Name"
  tsx tests/manual/edit-folder.test.ts abc123 title="Subfolder" parent_id="def456"
  tsx tests/manual/edit-folder.test.ts abc123 parent_id=""  # Move to top level

First list notebooks to get their IDs:
  npm run test:manual:list-notebooks
`)
  process.exit(0)
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  testEditFolder()
}
