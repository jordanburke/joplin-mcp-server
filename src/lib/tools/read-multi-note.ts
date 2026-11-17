import { List } from "functype"

import type { JoplinFolder, JoplinNote } from "./base-tool.js"
import BaseTool from "./base-tool.js"

class ReadMultiNote extends BaseTool {
  async call(noteIds: string[]): Promise<string> {
    if (!noteIds || !Array.isArray(noteIds) || noteIds.length === 0) {
      return 'Please provide an array of note IDs. Example: read_multinote note_ids=["id1", "id2", "id3"]'
    }

    // Validate that all IDs look like valid note IDs
    const invalidIds = noteIds.filter((id) => !id || id.length < 10 || !id.match(/[a-f0-9]/i))
    if (invalidIds.length > 0) {
      return `Error: Some IDs do not appear to be valid note IDs: ${invalidIds.join(", ")}\n\nNote IDs are long alphanumeric strings like "58a0a29f68bc4141b49c99f5d367638a".\n\nUse search_notes to find notes and their IDs.`
    }

    type NoteOutcome = { status: "ok" | "notFound" | "error"; noteId: string; lines: string[] }

    // Process each note ID, one at a time and in order
    const outcomes = await List(noteIds.map((noteId, i) => ({ noteId, i }))).mapAsync(
      async ({ noteId, i }): Promise<NoteOutcome> => {
        const heading = `## Note ${i + 1} of ${noteIds.length} (ID: ${noteId})\n`
        try {
          // Get the note details with all relevant fields
          const note = this.unwrap(
            await this.apiClient.get<JoplinNote>(`/notes/${noteId}`, {
              query: {
                fields: "id,title,body,parent_id,created_time,updated_time,is_todo,todo_completed,todo_due",
              },
            }),
          )

          // Validate note response
          if (!note || typeof note !== "object" || !note.id) {
            return {
              status: "error",
              noteId,
              lines: [heading, `Error: Unexpected response format from Joplin API when fetching note ${noteId}\n`],
            }
          }

          // Get the notebook info to show where this note is located
          const notebookInfo = await (async (): Promise<string> => {
            if (!note.parent_id) return "Unknown notebook"
            try {
              const notebook = this.unwrap(
                await this.apiClient.get<JoplinFolder>(`/folders/${note.parent_id}`, {
                  query: { fields: "id,title" },
                }),
              )
              if (notebook?.title) {
                return `"${notebook.title}" (notebook_id: "${note.parent_id}")`
              }
              return "Unknown notebook"
            } catch (err: unknown) {
              process.stderr.write(`Error fetching notebook info for note ${noteId}: ${err}\n`)
              return "Unknown notebook"
            }
          })()

          // Add todo status if applicable
          const todoLines = note.is_todo
            ? [
                `Status: ${note.todo_completed ? "Completed" : "Not completed"}`,
                ...(note.todo_due ? [`Due: ${this.formatDate(note.todo_due)}`] : []),
              ]
            : []

          return {
            status: "ok",
            noteId,
            lines: [
              heading,
              // Add note metadata
              `### Note: "${note.title}"`,
              `Notebook: ${notebookInfo}`,
              ...todoLines,
              // Add timestamps
              `Created: ${this.formatDate(note.created_time)}`,
              `Updated: ${this.formatDate(note.updated_time)}`,
              // Separators around the note body
              "\n---\n",
              note.body !== undefined && note.body !== "" ? note.body : "(This note has no content)",
              "\n---\n",
            ],
          }
        } catch (error: unknown) {
          process.stderr.write(`Error reading note ${noteId}: ${error}\n`)
          const err = error as { response?: { status?: number }; message?: string }
          if (err.response?.status === 404) {
            return { status: "notFound", noteId, lines: [heading, `Note with ID "${noteId}" not found.\n`] }
          }
          return {
            status: "error",
            noteId,
            lines: [heading, `Error reading note: ${err.message ?? "Unknown error"}\n`],
          }
        }
      },
    )

    const idsWith = (status: NoteOutcome["status"]): string[] =>
      outcomes
        .filter((o) => o.status === status)
        .map((o) => o.noteId)
        .toArray()
    const successful = idsWith("ok")
    const notFound = idsWith("notFound")
    const errors = idsWith("error")

    // Add a header, then each note's lines
    const resultLines: string[] = [`# Reading ${noteIds.length} notes\n`, ...outcomes.toArray().flatMap((o) => o.lines)]

    // Add a summary at the end
    resultLines.push("# Summary")
    resultLines.push(`Total notes requested: ${noteIds.length}`)
    resultLines.push(`Successfully retrieved: ${successful.length}`)

    if (notFound.length > 0) {
      resultLines.push(`Notes not found: ${notFound.length}`)
      resultLines.push(`IDs not found: ${notFound.join(", ")}`)
    }

    if (errors.length > 0) {
      resultLines.push(`Errors encountered: ${errors.length}`)
      resultLines.push(`IDs with errors: ${errors.join(", ")}`)
    }

    return resultLines.join("\n")
  }
}

export default ReadMultiNote
