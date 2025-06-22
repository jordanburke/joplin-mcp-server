#!/usr/bin/env node

import { fileURLToPath } from "url"
import { dirname, resolve } from "path"
import { pathToFileURL } from "url"

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

// Import and run the compiled index.js
const { default: main } = await import(pathToFileURL(resolve(__dirname, "../index.js")).href)
