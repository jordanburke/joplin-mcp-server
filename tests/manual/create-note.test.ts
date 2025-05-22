import dotenv from 'dotenv';
import JoplinAPIClient from '../../lib/joplin-api-client.js';
import { CreateNote, ListNotebooks } from '../../lib/tools/index.js';

// Load environment variables
dotenv.config();

// Check for required environment variables
const requiredEnvVars = ['JOPLIN_PORT', 'JOPLIN_TOKEN'] as const;
for (const envVar of requiredEnvVars) {
  if (!process.env[envVar]) {
    console.error(`Error: ${envVar} environment variable is required`);
    process.exit(1);
  }
}

// Create the Joplin API client
const apiClient = new JoplinAPIClient({
  port: parseInt(process.env.JOPLIN_PORT!),
  token: process.env.JOPLIN_TOKEN!
});

// Create the tools
const createNote = new CreateNote(apiClient);
const listNotebooks = new ListNotebooks(apiClient);

// Test the create note functionality
async function testCreateNote(): Promise<void> {
  try {
    // Check if Joplin is available
    const available = await apiClient.serviceAvailable();
    if (!available) {
      console.error('Error: Joplin service is not available');
      process.exit(1);
    }

    // Parse command line arguments
    const args = process.argv.slice(2);
    const title = args[0] || `Test Note ${new Date().toISOString()}`;
    const body = args[1] || `This is a test note created at ${new Date().toLocaleString()}`;
    const notebookId = args[2]; // Optional notebook ID

    console.log('Creating note with:');
    console.log(`  Title: "${title}"`);
    console.log(`  Body: "${body}"`);
    if (notebookId) {
      console.log(`  Notebook ID: "${notebookId}"`);
    } else {
      console.log('  Location: Root level (no notebook specified)');
    }
    console.log('');

    // Create the note
    const createOptions: any = { title, body };
    if (notebookId) {
      createOptions.parent_id = notebookId;
    }

    const result = await createNote.call(createOptions);
    console.log(result);

    console.log('\n📋 Available notebooks:');
    const notebooks = await listNotebooks.call();
    console.log(notebooks);

  } catch (error) {
    console.error('Error testing create note:', error);
  }
}

// Show usage if help requested
if (process.argv.includes('--help') || process.argv.includes('-h')) {
  console.log(`
Usage: tsx tests/manual/create-note.test.ts [title] [body] [notebook_id]

Arguments:
  title       - Note title (optional, defaults to timestamped title)
  body        - Note body content (optional, defaults to timestamped content)
  notebook_id - ID of notebook to create note in (optional, creates in root if omitted)

Examples:
  tsx tests/manual/create-note.test.ts
  tsx tests/manual/create-note.test.ts "My Note" "My note content"
  tsx tests/manual/create-note.test.ts "My Note" "My note content" "a1b2c3d4e5f6..."

First run list_notebooks to see available notebook IDs:
  npm run test:manual:list-notebooks
`);
  process.exit(0);
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  testCreateNote();
}