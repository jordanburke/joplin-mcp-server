import Database from "better-sqlite3"
import fs from "fs"
import { Either, Left, Right } from "functype"
import { join } from "path"

import type { SidecarError } from "./joplin-sidecar.js"

const sidecarError = (code: SidecarError["code"], message: string, cause?: unknown): SidecarError => ({
  code,
  message,
  cause,
})

export const writeJoplinSettings = (
  profileDir: string,
  settings: Record<string, string>,
): Either<SidecarError, void> => {
  try {
    fs.mkdirSync(profileDir, { recursive: true })

    const dbPath = join(profileDir, "database.sqlite")
    const db = new Database(dbPath)

    try {
      db.pragma("journal_mode = WAL")
      db.exec("CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT)")

      const upsert = db.prepare(
        "INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
      )

      const writeAll = db.transaction((entries: [string, string][]) => {
        for (const [key, value] of entries) {
          upsert.run(key, value)
        }
      })

      writeAll(Object.entries(settings))
      return Right(undefined as void)
    } finally {
      db.close()
    }
  } catch (e) {
    return Left(sidecarError("CONFIG_FAILED", "Failed to write settings to SQLite database", e))
  }
}
