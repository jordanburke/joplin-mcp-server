import { beforeAll, afterAll } from 'vitest';
import dotenv from 'dotenv';
import { resolve } from 'path';

// Load test environment variables
beforeAll(() => {
  // Try to load .env.test.local, fallback to .env.test, then .env
  const envFiles = ['.env.test.local', '.env.test', '.env'];
  
  for (const envFile of envFiles) {
    try {
      dotenv.config({ path: resolve(process.cwd(), envFile) });
      break;
    } catch (error) {
      // Continue to next file if current one doesn't exist
    }
  }
  
  // Set test defaults if not provided
  if (!process.env.JOPLIN_PORT) {
    process.env.JOPLIN_PORT = '41184';
  }
});

afterAll(() => {
  // Cleanup if needed
});