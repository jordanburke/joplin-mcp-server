#!/usr/bin/env node
// Fails if this build would publish a package missing a file the previous
// release shipped.
//
// v2.3.0 went out without manifest.json: a two-month-old package.json was
// replayed over newer work and silently dropped the entry from "files".
// Nothing in the pipeline noticed, because every test passed — the loss was in
// packaging, not in code. This compares what `npm pack` would produce against
// the tarball already on the registry.
import { execFileSync } from "child_process"
import { mkdtempSync, readdirSync, rmSync } from "fs"
import { tmpdir } from "os"
import { join } from "path"

const run = (cmd, args, opts = {}) => execFileSync(cmd, args, { encoding: "utf8", ...opts })

// Build hashes change on every content edit, so dist/help-text-DnRza0JR.js and
// its next-build counterpart are the same entry for our purposes.
const normalize = (path) => path.replace(/-[A-Za-z0-9_-]{8}(\.js(\.map)?)$/, "-<hash>$1")

const currentContents = () => {
  const output = run("npm", ["pack", "--dry-run", "--json"], { stdio: ["ignore", "pipe", "ignore"] })
  return JSON.parse(output)[0].files.map((file) => file.path)
}

const publishedContents = (spec) => {
  const dir = mkdtempSync(join(tmpdir(), "pkg-check-"))
  try {
    run("npm", ["pack", spec, "--pack-destination", dir], { stdio: ["ignore", "pipe", "ignore"] })
    const tarball = join(dir, readdirSync(dir)[0])
    return run("tar", ["tzf", tarball])
      .split("\n")
      .filter((line) => line.length > 0 && !line.endsWith("/"))
      .map((line) => line.replace(/^package\//, ""))
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

const name = JSON.parse(run("npm", ["pkg", "get", "name"]))
const spec = `${name}@latest`

let published
try {
  published = publishedContents(spec)
} catch {
  console.log(`No published ${spec} to compare against — skipping.`)
  process.exit(0)
}

const current = new Set(currentContents().map(normalize))
const missing = published.filter((path) => !current.has(normalize(path)))

if (missing.length > 0) {
  console.error(`✗ This build drops ${missing.length} file(s) that ${spec} ships:\n`)
  for (const path of missing) console.error(`    ${path}`)
  console.error(`\nIf the removal is deliberate, note it in the release. Otherwise check the`)
  console.error(`"files" array in package.json — an entry has probably gone missing.`)
  process.exit(1)
}

console.log(`✓ Package contents cover everything ${spec} ships (${published.length} files).`)
