import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import dotenv from 'dotenv';
import { z } from 'zod';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

import logger from './lib/logger.js';

import parseArgs from './lib/parse-args.js';
import JoplinAPIClient from './lib/joplin-api-client.js';
import { ListNotebooks, SearchNotes, ReadNotebook, ReadNote, ReadMultiNote, CreateNote, CreateFolder } from './lib/tools/index.js';

// Parse command line arguments
parseArgs();

// Set default port if not specified
if (!process.env.JOPLIN_PORT) {
  process.env.JOPLIN_PORT = '41184';
}

// Check for required environment variables
if (!process.env.JOPLIN_TOKEN) {
  process.stderr.write('Error: JOPLIN_TOKEN is required. Use --token <token> or set JOPLIN_TOKEN environment variable.\n');
  process.stderr.write('Find your token in Joplin: Tools > Options > Web Clipper\n');
  process.exit(1);
}

// Create the Joplin API client
const apiClient = new JoplinAPIClient({
  port: parseInt(process.env.JOPLIN_PORT || '41184'),
  token: process.env.JOPLIN_TOKEN!
});

// Create the MCP server
const server = new McpServer({
  name: 'joplin-mcp-server',
  version: '1.0.0'
});

// Register the list_notebooks tool
server.tool(
  'list_notebooks',
  'Retrieve the complete notebook hierarchy from Joplin',
  {},
  async () => {
    const result = await new ListNotebooks(apiClient).call();
    return {
      content: [{ type: 'text', text: result }]
    };
  }
);

// Register the search_notes tool
server.tool(
  'search_notes',
  'Search for notes in Joplin and return matching notebooks',
  { query: z.string() },
  async ({ query }: { query: string }) => {
    const result = await new SearchNotes(apiClient).call(query);
    return {
      content: [{ type: 'text', text: result }]
    };
  }
);

// Register the read_notebook tool
server.tool(
  'read_notebook',
  'Read the contents of a specific notebook',
  { notebook_id: z.string() },
  async ({ notebook_id }: { notebook_id: string }) => {
    const result = await new ReadNotebook(apiClient).call(notebook_id);
    return {
      content: [{ type: 'text', text: result }]
    };
  }
);

// Register the read_note tool
server.tool(
  'read_note',
  'Read the full content of a specific note',
  { note_id: z.string() },
  async ({ note_id }: { note_id: string }) => {
    const result = await new ReadNote(apiClient).call(note_id);
    return {
      content: [{ type: 'text', text: result }]
    };
  }
);

// Register the read_multinote tool
server.tool(
  'read_multinote',
  'Read the full content of multiple notes at once',
  { note_ids: z.array(z.string()) },
  async ({ note_ids }: { note_ids: string[] }) => {
    const result = await new ReadMultiNote(apiClient).call(note_ids);
    return {
      content: [{ type: 'text', text: result }]
    };
  }
);

// Register the create_note tool
server.tool(
  'create_note',
  'Create a new note in Joplin',
  { 
    title: z.string().optional(),
    body: z.string().optional(),
    body_html: z.string().optional(),
    parent_id: z.string().optional(),
    is_todo: z.boolean().optional(),
    image_data_url: z.string().optional()
  },
  async (params: { 
    title?: string | undefined; 
    body?: string | undefined; 
    body_html?: string | undefined; 
    parent_id?: string | undefined; 
    is_todo?: boolean | undefined; 
    image_data_url?: string | undefined; 
  }) => {
    const result = await new CreateNote(apiClient).call(params);
    return {
      content: [{ type: 'text', text: result }]
    };
  }
);

// Register the create_folder tool
server.tool(
  'create_folder',
  'Create a new folder/notebook in Joplin',
  { 
    title: z.string(),
    parent_id: z.string().optional()
  },
  async (params: { title: string; parent_id?: string | undefined }) => {
    const result = await new CreateFolder(apiClient).call(params);
    return {
      content: [{ type: 'text', text: result }]
    };
  }
);

// Create logs directory if it doesn't exist
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const logsDir = path.join(__dirname, 'logs');

if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

// Create a log file for this session
const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
const logFile = path.join(logsDir, `mcp-server-${timestamp}.log`);

// Log server startup (commented out for debugging)
// logger.info(`Starting MCP server (version 1.0.0)`);
// logger.info(`Log file: ${logFile}`);

// Create a custom transport wrapper to log commands and responses
class LoggingTransport extends StdioServerTransport {
  private commandCounter: number;

  constructor() {
    super();
    this.commandCounter = 0;
  }

  async sendMessage(message: any): Promise<void> {
    // Log outgoing message (response)
    const logEntry = {
      timestamp: new Date().toISOString(),
      direction: 'RESPONSE',
      message
    };

    // Log to console (commented out for debugging)
    // logger.debug(`Sending response: ${JSON.stringify(message)}`);

    // Log to file
    fs.appendFileSync(logFile, JSON.stringify(logEntry) + '\n');

    // Call the original method
    const parent = Object.getPrototypeOf(Object.getPrototypeOf(this));
    return parent.sendMessage.call(this, message);
  }

  async handleMessage(message: any): Promise<void> {
    // Log incoming message (command)
    this.commandCounter++;
    const logEntry = {
      timestamp: new Date().toISOString(),
      direction: 'COMMAND',
      commandNumber: this.commandCounter,
      message
    };

    // Log to console (commented out for debugging)
    // logger.info(`Received command #${this.commandCounter}: ${message.method || 'unknown method'}`);
    // logger.debug(`Command details: ${JSON.stringify(message)}`);

    // Log to file
    fs.appendFileSync(logFile, JSON.stringify(logEntry) + '\n');

    // Call the original method
    const parent = Object.getPrototypeOf(Object.getPrototypeOf(this));
    return parent.handleMessage.call(this, message);
  }
}

// Start the server with logging transport
const transport = new LoggingTransport();

// Log connection status (commented out for debugging)
// logger.info('Connecting to transport...');

try {
  await server.connect(transport);
  // logger.info('MCP server started and ready to receive commands');
} catch (error) {
  process.stderr.write(`Failed to start MCP server: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
}
