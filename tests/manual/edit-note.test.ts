import dotenv from 'dotenv';
import JoplinAPIClient from '../../lib/joplin-api-client.js';
import { EditNote, SearchNotes, ReadNote } from '../../lib/tools/index.js';

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
const editNote = new EditNote(apiClient);
const searchNotes = new SearchNotes(apiClient);
const readNote = new ReadNote(apiClient);

// Test the edit note functionality
async function testEditNote(): Promise<void> {
  try {
    // Check if Joplin is available
    const available = await apiClient.serviceAvailable();
    if (!available) {
      console.error('Error: Joplin service is not available');
      process.exit(1);
    }

    // Parse command line arguments
    const args = process.argv.slice(2);
    const noteId = args[0];
    
    if (!noteId) {
      console.log('No note ID provided. Searching for notes to edit:');
      const searchQuery = args[1] || 'test';
      const searchResults = await searchNotes.call(searchQuery);
      console.log(searchResults);
      console.log('\nPlease run again with a note ID from the search results above.');
      console.log('Usage: tsx tests/manual/edit-note.test.ts <note_id> [field=value] [field=value]...');
      console.log('\nExamples:');
      console.log('  tsx tests/manual/edit-note.test.ts abc123 title="Updated Title"');
      console.log('  tsx tests/manual/edit-note.test.ts abc123 body="New content" is_todo=true');
      console.log('  tsx tests/manual/edit-note.test.ts abc123 todo_completed=true');
      process.exit(0);
    }

    // Parse edit parameters from remaining arguments
    const editOptions: any = { note_id: noteId };
    
    for (let i = 1; i < args.length; i++) {
      const arg = args[i];
      const [key, value] = arg.split('=', 2);
      
      if (!value) {
        console.error(`Invalid argument: ${arg}. Use format key=value`);
        continue;
      }

      // Parse different types of values
      if (key === 'is_todo' || key === 'todo_completed') {
        editOptions[key] = value.toLowerCase() === 'true';
      } else if (key === 'todo_due') {
        editOptions[key] = parseInt(value);
      } else {
        // Remove quotes if present
        editOptions[key] = value.replace(/^["']|["']$/g, '');
      }
    }

    console.log('📝 Current note:');
    const currentNote = await readNote.call(noteId);
    console.log(currentNote);
    console.log('\n' + '='.repeat(80) + '\n');

    console.log('🔄 Editing note with:');
    Object.entries(editOptions).forEach(([key, value]) => {
      if (key !== 'note_id') {
        console.log(`  ${key}: ${JSON.stringify(value)}`);
      }
    });
    console.log('');

    const result = await editNote.call(editOptions);
    console.log(result);

  } catch (error) {
    console.error('Error testing edit note:', error);
  }
}

// Show usage if help requested
if (process.argv.includes('--help') || process.argv.includes('-h')) {
  console.log(`
Usage: tsx tests/manual/edit-note.test.ts <note_id> [field=value] [field=value]...

Arguments:
  note_id - ID of the note to edit (required)
  
Available fields:
  title="New Title"           - Update note title
  body="New content"          - Update note body (Markdown)
  body_html="<p>HTML</p>"     - Update note body (HTML)
  parent_id="notebook_id"     - Move to different notebook
  is_todo=true/false          - Convert to/from todo
  todo_completed=true/false   - Mark todo as completed/incomplete
  todo_due=1234567890000      - Set due date (timestamp)

Examples:
  tsx tests/manual/edit-note.test.ts abc123 title="Updated Title"
  tsx tests/manual/edit-note.test.ts abc123 body="New content" is_todo=true
  tsx tests/manual/edit-note.test.ts abc123 todo_completed=true
  tsx tests/manual/edit-note.test.ts abc123 parent_id="def456"

First search for notes to get their IDs:
  tsx tests/manual/search-notes.test.ts "search term"
`);
  process.exit(0);
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  testEditNote();
}