#!/usr/bin/env node

import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import { execSync } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Simply run the main index.ts from the bin directory using tsx
const indexPath = resolve(__dirname, '../index.ts');

try {
  // Execute the main server with the same arguments using tsx
  execSync(`npx tsx "${indexPath}" ${process.argv.slice(2).join(' ')}`, {
    stdio: 'inherit',
    cwd: resolve(__dirname, '..')
  });
} catch (error) {
  process.exit(error.status || 1);
}