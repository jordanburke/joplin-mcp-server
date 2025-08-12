import dotenv from "dotenv"
import JoplinAPIClient from "../../lib/joplin-api-client.js"
import { DeleteFolder, ListNotebooks, ReadNotebook } from "../../lib/tools/index.js"

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
const deleteFolder = new DeleteFolder(apiClient)
const listNotebooks = new ListNotebooks(apiClient)
const readNotebook = new ReadNotebook(apiClient)

// Test the delete folder functionality
async function testDeleteFolder(): Promise<void> {
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
    const confirmFlag = args[1]
    const forceFlag = args[2]

    if (!folderId) {
      console.log("No folder ID provided. Listing available notebooks:")
      const notebooks = await listNotebooks.call()
      console.log(notebooks)
      console.log("\n⚠️  DANGER ZONE - DELETE OPERATIONS")
      console.log("Please run again with a folder ID from the list above.")
      console.log("Usage: tsx tests/manual/delete-folder.test.ts <folder_id> [confirm] [force]")
      console.log("\nExamples:")
      console.log("  tsx tests/manual/delete-folder.test.ts abc123                    # Show deletion preview")
      console.log("  tsx tests/manual/delete-folder.test.ts abc123 confirm            # Delete if empty")
      console.log("  tsx tests/manual/delete-folder.test.ts abc123 confirm force      # Force delete with contents")
      console.log("\n⚠️  DELETION IS PERMANENT AND CANNOT BE UNDONE!")
      process.exit(0)
    }

    console.log("📁 Notebook to be deleted:")
    const currentNotebook = await readNotebook.call(folderId)
    console.log(currentNotebook)
    console.log("\n" + "=".repeat(80) + "\n")

    const deleteOptions: any = { folder_id: folderId }

    // Check if user wants to actually confirm deletion
    if (confirmFlag === "confirm") {
      deleteOptions.confirm = true
      if (forceFlag === "force") {
        deleteOptions.force = true
        console.log("🗑️  PROCEEDING WITH FORCE DELETION (INCLUDING ALL CONTENTS)...")
      } else {
        console.log("🗑️  PROCEEDING WITH DELETION...")
      }
    } else {
      console.log("🔍 DELETION PREVIEW (not actually deleting):")
    }
    console.log("")

    const result = await deleteFolder.call(deleteOptions)
    console.log(result)

    if (!confirmFlag || confirmFlag !== "confirm") {
      console.log("\n💡 To actually delete this notebook:")
      console.log(`  Empty folder: tsx tests/manual/delete-folder.test.ts ${folderId} confirm`)
      console.log(`  With contents: tsx tests/manual/delete-folder.test.ts ${folderId} confirm force`)
      console.log("\n⚠️  WARNING: This will permanently delete the notebook and all its contents!")
    } else {
      console.log("\n📋 Updated notebook hierarchy:")
      const updatedNotebooks = await listNotebooks.call()
      console.log(updatedNotebooks)
    }
  } catch (_error) {
    console.error("Error testing:", _error)
  }
}

// Show usage if help requested
if (process.argv.includes("--help") || process.argv.includes("-h")) {
  console.log(`
⚠️  DANGER: DELETE FOLDER TOOL

Usage: tsx tests/manual/delete-folder.test.ts <folder_id> [confirm] [force]

Arguments:
  folder_id - ID of the folder/notebook to delete (required)
  confirm   - Actually perform the deletion (optional)
  force     - Force delete even if folder contains items (optional)

Examples:
  tsx tests/manual/delete-folder.test.ts abc123                    # Preview deletion
  tsx tests/manual/delete-folder.test.ts abc123 confirm            # Delete if empty
  tsx tests/manual/delete-folder.test.ts abc123 confirm force      # Force delete with all contents

⚠️  WARNING: 
- Deletion is permanent and cannot be undone!
- Force deletion will destroy ALL notes and subfolders inside!

First list notebooks to get their IDs:
  npm run test:manual:list-notebooks
`)
  process.exit(0)
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  testDeleteFolder()
}
