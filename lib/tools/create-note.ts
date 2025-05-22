import BaseTool, { JoplinNote } from './base-tool.js';

interface CreateNoteOptions {
  title?: string | undefined;
  body?: string | undefined;
  body_html?: string | undefined;
  parent_id?: string | undefined;
  is_todo?: boolean | undefined;
  image_data_url?: string | undefined;
}

interface CreateNoteResponse extends JoplinNote {
  // Additional fields that might be returned on creation
}

class CreateNote extends BaseTool {
  async call(options: CreateNoteOptions): Promise<string> {
    if (!options || typeof options !== 'object') {
      return 'Please provide note creation options. Example: create_note {"title": "My Note", "body": "Note content"}';
    }

    // Validate that we have at least a title or body
    if (!options.title && !options.body && !options.body_html) {
      return 'Please provide at least a title, body, or body_html for the note.';
    }

    // Validate parent_id if provided
    if (options.parent_id && (options.parent_id.length < 10 || !options.parent_id.match(/[a-f0-9]/i))) {
      return `Error: "${options.parent_id}" does not appear to be a valid notebook ID.\n\nNotebook IDs are long alphanumeric strings like "58a0a29f68bc4141b49c99f5d367638a".\n\nUse list_notebooks to see available notebooks and their IDs.`;
    }

    try {
      // Prepare the request body
      const requestBody: CreateNoteOptions = {};
      
      if (options.title) requestBody.title = options.title;
      if (options.body) requestBody.body = options.body;
      if (options.body_html) requestBody.body_html = options.body_html;
      if (options.parent_id) requestBody.parent_id = options.parent_id;
      if (options.is_todo !== undefined) requestBody.is_todo = options.is_todo;
      if (options.image_data_url) requestBody.image_data_url = options.image_data_url;

      // Create the note
      const createdNote = await this.apiClient.post<CreateNoteResponse>('/notes', requestBody);

      // Validate response
      if (!createdNote || typeof createdNote !== 'object' || !createdNote.id) {
        return 'Error: Unexpected response format from Joplin API when creating note';
      }

      // Get notebook info if available
      let notebookInfo = "Root level";
      if (createdNote.parent_id) {
        try {
          const notebook = await this.apiClient.get(`/folders/${createdNote.parent_id}`, {
            query: { fields: 'id,title' }
          });
          if (notebook && notebook.title) {
            notebookInfo = `"${notebook.title}" (notebook_id: "${createdNote.parent_id}")`;
          }
        } catch (error) {
          // Continue even if we can't get notebook info
          notebookInfo = `Notebook ID: ${createdNote.parent_id}`;
        }
      }

      // Format success response
      const resultLines: string[] = [];
      resultLines.push(`✅ Successfully created note!`);
      resultLines.push('');
      resultLines.push(`📝 Note Details:`);
      resultLines.push(`   Title: "${createdNote.title || 'Untitled'}"`);
      resultLines.push(`   Note ID: ${createdNote.id}`);
      resultLines.push(`   Location: ${notebookInfo}`);
      
      if (createdNote.is_todo) {
        resultLines.push(`   Type: Todo item`);
      }
      
      const createdDate = this.formatDate(createdNote.created_time);
      resultLines.push(`   Created: ${createdDate}`);
      
      resultLines.push('');
      resultLines.push(`🔗 Next steps:`);
      resultLines.push(`   - Read the note: read_note note_id="${createdNote.id}"`);
      if (createdNote.parent_id) {
        resultLines.push(`   - View notebook: read_notebook notebook_id="${createdNote.parent_id}"`);
      }
      resultLines.push(`   - Search for it: search_notes query="${createdNote.title}"`);

      return resultLines.join('\n');

    } catch (error: any) {
      if (error.response) {
        // Handle specific API errors
        if (error.response.status === 400) {
          return `Error creating note: Invalid request data.\n\nPlease check your input parameters. ${error.response.data?.error || ''}`;
        }
        if (error.response.status === 404 && options.parent_id) {
          return `Error: Notebook with ID "${options.parent_id}" not found.\n\nUse list_notebooks to see available notebooks and their IDs.`;
        }
      }
      return this.formatError(error, 'creating note');
    }
  }
}

export default CreateNote;