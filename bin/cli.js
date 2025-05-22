#!/usr/bin/env node

import { fileURLToPath } from "url"
import { dirname, resolve } from "path"

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

// Import and run the compiled index.js
const { default: main } = await import(resolve(__dirname, "../index.js"))
