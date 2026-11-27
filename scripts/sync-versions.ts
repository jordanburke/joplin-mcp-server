#!/usr/bin/env tsx

/**
 * Propagates package.json's version into every file that has to repeat it.
 *
 * Runs from the npm `version` lifecycle hook, which fires after the bump and
 * before the commit, so the synced files land in the version commit itself.
 * Without that, a tagged commit fails its own check:versions gate.
 *
 * check-versions.ts stays as the backstop: this keeps the fields in step, that
 * one catches it if they ever aren't.
 */

import fs from "fs"
import path from "path"
import { fileURLToPath } from "url"
import { isDeepStrictEqual } from "util"

type PackageJson = {
  version: string
}

type ServerJson = {
  version: string
  packages?: Array<{ version: string }>
}

type ManifestJson = {
  version: string
}

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..")

const readJSON = <T>(file: string): T | null => {
  const full = path.join(ROOT, file)
  return fs.existsSync(full) ? (JSON.parse(fs.readFileSync(full, "utf-8")) as T) : null
}

const VERSION_FIELD = /("version"\s*:\s*)"[^"]*"/g

/**
 * Write `expected` by replacing the `"version"` values in the file's own text, rather than
 * re-serialising it. JSON.stringify would expand the arrays Prettier keeps inline and unescape
 * characters, so the version commit would fail format:check. The result is parsed back and must
 * equal `expected`, so a "version" key this script doesn't own can't change unnoticed.
 */
const writeVersions = (file: string, version: string, expected: unknown): void => {
  const full = path.join(ROOT, file)
  const text = fs.readFileSync(full, "utf-8")
  const updated = text.replace(VERSION_FIELD, (_match, key: string) => `${key}"${version}"`)
  if (!isDeepStrictEqual(JSON.parse(updated), expected)) {
    console.error(`${file}: replacing its "version" values changed more than the fields this script syncs`)
    process.exit(1)
  }
  fs.writeFileSync(full, updated)
}

const main = (): void => {
  const pkg = readJSON<PackageJson>("package.json")
  if (!pkg) {
    console.error("Could not read package.json")
    process.exit(1)
  }

  const version = pkg.version
  const synced: string[] = []

  const server = readJSON<ServerJson>("server.json")
  if (server) {
    server.version = version
    // The registry repeats the version per package entry as well as at the top.
    server.packages?.forEach((entry) => {
      entry.version = version
    })
    writeVersions("server.json", version, server)
    synced.push(`server.json (${1 + (server.packages?.length ?? 0)} fields)`)
  }

  const manifest = readJSON<ManifestJson>("manifest.json")
  if (manifest) {
    manifest.version = version
    writeVersions("manifest.json", version, manifest)
    synced.push("manifest.json")
  }

  console.log(`Synced version ${version} -> ${synced.length > 0 ? synced.join(", ") : "nothing to sync"}`)
}

main()
