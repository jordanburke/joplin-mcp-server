import dotenv from "dotenv"
import JoplinAPIClient from "../../lib/joplin-api-client.js"
import { DeleteNote, SearchNotes, ReadNote } from "../../lib/tools/index.js"

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
const deleteNote = new DeleteNote(apiClient)
const searchNotes = new SearchNotes(apiClient)
const readNote = new ReadNote(apiClient)

// Test the delete note functionality
async function testDeleteNote(): Promise<void> {
  try {
    // Check if Joplin is available
    const available = await apiClient.serviceAvailable()
    if (!available) {
      console.error("Error: Joplin service is not available")
      process.exit(1)
    }

    // Parse command line arguments
    const args = process.argv.slice(2)
    const noteId = args[0]
    const confirmFlag = args[1]

    if (!noteId) {
      console.log("No note ID provided. Searching for notes to delete:")
      const searchQuery = args[1] || "test"
      const searchResults = await searchNotes.call(searchQuery)
      console.log(searchResults)
      console.log("\n⚠️  DANGER ZONE - DELETE OPERATIONS")
      console.log("Please run again with a note ID from the search results above.")
      console.log("Usage: tsx tests/manual/delete-note.test.ts <note_id> [confirm]")
      console.log("\nExamples:")
      console.log("  tsx tests/manual/delete-note.test.ts abc123           # Show deletion preview")
      console.log("  tsx tests/manual/delete-note.test.ts abc123 confirm   # Actually delete")
      console.log("\n⚠️  DELETION IS PERMANENT AND CANNOT BE UNDONE!")
      process.exit(0)
    }

    console.log("📝 Note to be deleted:")
    const currentNote = await readNote.call(noteId)
    console.log(currentNote)
    console.log("\n" + "=".repeat(80) + "\n")

    const deleteOptions: any = { note_id: noteId }

    // Check if user wants to actually confirm deletion
    if (confirmFlag === "confirm") {
      deleteOptions.confirm = true
      console.log("🗑️  PROCEEDING WITH DELETION...")
    } else {
      console.log("🔍 DELETION PREVIEW (not actually deleting):")
    }
    console.log("")

    const result = await deleteNote.call(deleteOptions)
    console.log(result)

    if (!confirmFlag || confirmFlag !== "confirm") {
      console.log("\n💡 To actually delete this note, run:")
      console.log(`tsx tests/manual/delete-note.test.ts ${noteId} confirm`)
      console.log("\n⚠️  WARNING: This will permanently delete the note!")
    }
  } catch (_error) {
    console.error("Error testing:", _error)
  }
}

// Show usage if help requested
if (process.argv.includes("--help") || process.argv.includes("-h")) {
  console.log(`
⚠️  DANGER: DELETE NOTE TOOL

Usage: tsx tests/manual/delete-note.test.ts <note_id> [confirm]

Arguments:
  note_id - ID of the note to delete (required)
  confirm - Actually perform the deletion (optional)

Examples:
  tsx tests/manual/delete-note.test.ts abc123           # Preview deletion
  tsx tests/manual/delete-note.test.ts abc123 confirm   # Actually delete

⚠️  WARNING: Deletion is permanent and cannot be undone!

First search for notes to get their IDs:
  tsx tests/manual/search-notes.test.ts "search term"
`)
  process.exit(0)
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  testDeleteNote()
}
