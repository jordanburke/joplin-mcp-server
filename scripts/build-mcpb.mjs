#!/usr/bin/env node
// Builds a self-contained .mcpb bundle: the built server plus a production-only
// node_modules (including the Joplin CLI, which the sidecar spawns). Packing the
// repo root directly would zip the entire dev tree, so we stage a clean directory
// and run a fresh production install there.
import { execFileSync } from "child_process"
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "fs"
import { dirname, join } from "path"
import { fileURLToPath } from "url"

const root = join(dirname(fileURLToPath(import.meta.url)), "..")
const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"))
const stage = join(root, ".mcpb-build")
const out = join(root, `${pkg.name}-${pkg.version}.mcpb`)

const run = (cmd, args, cwd) => execFileSync(cmd, args, { cwd, stdio: "inherit" })

if (!existsSync(join(root, "dist", "bin.js"))) {
  throw new Error("dist/ is not built — run `pnpm build` first")
}

console.log("• Staging clean build directory")
rmSync(stage, { recursive: true, force: true })
mkdirSync(join(stage, "server"), { recursive: true })

console.log("• Copying built server → server/")
cpSync(join(root, "dist"), join(stage, "server"), { recursive: true })

console.log("• Writing production package.json")
writeFileSync(
  join(stage, "package.json"),
  JSON.stringify({ name: pkg.name, version: pkg.version, type: "module", dependencies: pkg.dependencies }, null, 2) +
    "\n",
)

console.log("• Installing production dependencies (this pulls the Joplin CLI)")
run("npm", ["install", "--omit=dev", "--no-audit", "--no-fund", "--loglevel=error"], stage)

console.log("• Copying manifest.json")
cpSync(join(root, "manifest.json"), join(stage, "manifest.json"))

console.log("• Packing .mcpb")
run("npx", ["-y", "@anthropic-ai/mcpb", "pack", stage, out], root)

console.log(`\n✓ Built ${out}`)
