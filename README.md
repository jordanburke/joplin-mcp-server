# Joplin MCP Server
[![smithery badge](https://smithery.ai/badge/@jordanburke/joplin-mcp-server)](https://smithery.ai/server/@jordanburke/joplin-mcp-server)

This is a Node.js implementation of an MCP (Model Context Protocol) server for Joplin.

## Installation

### Installing via Smithery

To install Joplin MCP Server for Claude Desktop automatically via [Smithery](https://smithery.ai/server/@jordanburke/joplin-mcp-server):

```bash
npx -y @smithery/cli install @jordanburke/joplin-mcp-server --client claude
```

### Local Development

```bash
npm install
```

## Configuration

Create a `.env` file with the following variables:

```
JOPLIN_PORT=41184
JOPLIN_TOKEN=your_joplin_token
```

You can find your Joplin token in the Joplin desktop app under:
Tools > Options > Web Clipper

## Usage

### Local Development

Start the server:

```bash
npm start
```

You can also specify a custom environment file:

```bash
npm start -- --env-file .env.custom
```

### Using npx (Recommended)

After publishing to npm, you can use npx to run the server without installation:

```bash
# Using command line arguments
npx joplin-mcp-server --port 41184 --token your_joplin_token

# Using environment file
npx joplin-mcp-server --env-file /path/to/your/.env

# Mixed approach (args override env file)
npx joplin-mcp-server --env-file .env --port 41185
```

### Command Line Options

```
OPTIONS:
  --env-file <file>    Load environment variables from file
  --port <port>        Joplin port (default: 41184)
  --token <token>      Joplin API token
  --transport <type>   Transport type: stdio (default) or http
  --http-port <port>   HTTP server port (default: 3000, only used with --transport http)
  --help, -h           Show help message
```

### MCP Client Configuration

#### Claude Desktop Configuration

Add to your `claude_desktop_config.json` file using environment variable expansion (recommended):

```json
{
  "mcpServers": {
    "joplin": {
      "command": "npx",
      "args": ["joplin-mcp-server"],
      "env": {
        "JOPLIN_PORT": "41184",
        "JOPLIN_TOKEN": "${JOPLIN_TOKEN}"
      }
    }
  }
}
```

Then set the `JOPLIN_TOKEN` environment variable in your system:

```bash
# On macOS/Linux
export JOPLIN_TOKEN=your_actual_token_here

# On Windows
set JOPLIN_TOKEN=your_actual_token_here
```

Alternative using command-line arguments with environment expansion:

```json
{
  "mcpServers": {
    "joplin": {
      "command": "npx",
      "args": [
        "joplin-mcp-server",
        "--port",
        "${JOPLIN_PORT}",
        "--token",
        "${JOPLIN_TOKEN}"
      ],
      "env": {
        "JOPLIN_PORT": "41184",
        "JOPLIN_TOKEN": "your_actual_token_here"
      }
    }
  }
}
```

#### Other MCP Clients

Usage in mcp.json (Cursor and other tools):

```json
{
  "joplin": {
    "command": "npx",
    "args": ["joplin-mcp-server", "--port", "41184", "--token", "your_joplin_token"]
  }
}
```

Or using environment file:

```json
{
  "joplin": {
    "command": "npx",
    "args": ["joplin-mcp-server", "--env-file", "/path/to/your/.env"]
  }
}
```

### Legacy Usage (if installed locally)

Usage in Augment Code:
name: `joplin`
command: `node /path/to/your/mcp-joplin/index.js --env-file /path/to/your/mcp-joplin/.env`

Usage in mcp.json (cursor other tools)

```json
  "joplin":{
      "command":"node",
      "args":[
        "/path/to/your/mcp-joplin/index.js",
        "--env-file",
        "/path/to/your/mcp-joplin/.env"
      ]
  }
```

### Logging

The server logs all incoming commands and outgoing responses. Logs are stored in two places:

1. **Console output**: Basic information is displayed in the console
2. **Log files**: Detailed logs are saved in the `logs` directory with timestamps

You can adjust the log level by setting the `LOG_LEVEL` environment variable:

```bash
LOG_LEVEL=debug npm start
```

Available log levels (from most to least verbose):

- `debug`: All messages including detailed command and response data
- `info`: Standard operational messages (default)
- `warn`: Warnings and errors only
- `error`: Only error messages

## Available Tools

### list_notebooks

Retrieves the complete notebook hierarchy from Joplin.

```
# Example output:
Notebook 1 (id: "abc123")
  Subnotebook 1.1 (id: "def456")
  Subnotebook 1.2 (id: "ghi789")
Notebook 2 (id: "jkl012")
```

### search_notes

Searches for notes in Joplin and returns matching notebooks.

**Parameters:**

- `query`: The search query string

```
# Example usage:
search_notes query="project meeting"

# Example output:
Found 2 notes matching query: "project meeting"
NOTE: To read a notebook, use the notebook ID (not the note title)

- Note: "Weekly Project Meeting" (note_id: "abc123")
  Notebook: "Work" (notebook_id: "58a0a29f68bc4141b49c99f5d367638a")
  Updated: 3/15/2025, 10:30:45 AM
  Snippet: Notes from our weekly project meeting. Topics discussed: timeline, resources, next steps...
  To read this notebook: read_notebook notebook_id="58a0a29f68bc4141b49c99f5d367638a"

- Note: "Project Kickoff Meeting" (note_id: "def456")
  Notebook: "Projects" (notebook_id: "72b1c45d89ef3212a67b98f4e5d23a1b")
  Updated: 3/10/2025, 2:15:30 PM
  Snippet: Initial project meeting with stakeholders. Key decisions: project scope, team members...
  To read this notebook: read_notebook notebook_id="72b1c45d89ef3212a67b98f4e5d23a1b"
```

> **Important**: Note the difference between note titles and IDs. When using the `read_notebook` command, you must use the notebook ID (a long alphanumeric string), not the notebook title.

### read_notebook

Reads the contents of a specific notebook.

**Parameters:**

- `notebook_id`: The ID of the notebook to read

```
# Example usage:
read_notebook notebook_id="58a0a29f68bc4141b49c99f5d367638a"

# Example output:
# Notebook: "Work" (notebook_id: "58a0a29f68bc4141b49c99f5d367638a")
Contains 3 notes:
NOTE: This is showing the contents of notebook "Work", not a specific note.

- Note: "Weekly Project Meeting" (note_id: "def456")
  Updated: 3/15/2025, 10:30:45 AM

- ✅ Note: "Call client" (note_id: "ghi789")
  Updated: 3/14/2025, 3:45:12 PM

- ☐ Note: "Prepare presentation" (note_id: "jkl012")
  Updated: 3/13/2025, 9:20:33 AM
```

> **Common Error**: If you try to use a note title (like "todo") instead of a notebook ID, you'll get an error. Always use the notebook ID (the long alphanumeric string) shown in the search results or notebook list.

### read_note

Reads the full content of a specific note.

**Parameters:**

- `note_id`: The ID of the note to read

```
# Example usage:
read_note note_id="def456"

# Example output:
# Note: "Weekly Project Meeting"
Note ID: def456
Notebook: "Work" (notebook_id: "58a0a29f68bc4141b49c99f5d367638a")
Created: 3/15/2025, 10:00:12 AM
Updated: 3/15/2025, 10:30:45 AM

---

# Weekly Project Meeting

## Agenda
1. Project status update
2. Timeline review
3. Resource allocation
4. Next steps

## Notes
- Project is on track for Q2 delivery
- Need to allocate additional resources to the UI team
- Next meeting scheduled for next Friday

---

Related commands:
- To view the notebook containing this note: read_notebook notebook_id="58a0a29f68bc4141b49c99f5d367638a"
- To search for more notes: search_notes query="your search term"
```

> **Note**: The `read_note` command shows the full content of a specific note, while the `read_notebook` command shows a list of notes in a notebook. Use `search_notes` to find notes and get their IDs.

### read_multinote

Reads the full content of multiple notes at once.

**Parameters:**

- `note_ids`: An array of note IDs to read

```
# Example usage:
read_multinote note_ids=["def456", "ghi789", "jkl012"]

# Example output:
# Reading 3 notes

## Note 1 of 3 (ID: def456)

### Note: "Weekly Project Meeting"
Notebook: "Work" (notebook_id: "58a0a29f68bc4141b49c99f5d367638a")
Created: 3/15/2025, 10:00:12 AM
Updated: 3/15/2025, 10:30:45 AM

---

# Weekly Project Meeting

## Agenda
1. Project status update
2. Timeline review

---

## Note 2 of 3 (ID: ghi789)

### Note: "Call client"
Notebook: "Work" (notebook_id: "58a0a29f68bc4141b49c99f5d367638a")
Status: Completed
Created: 3/14/2025, 3:00:00 PM
Updated: 3/14/2025, 3:45:12 PM

---

Discussed project timeline and next steps.
Client is happy with progress.

---

## Note 3 of 3 (ID: jkl012)

### Note: "Prepare presentation"
Notebook: "Work" (notebook_id: "58a0a29f68bc4141b49c99f5d367638a")
Status: Not completed
Due: 3/20/2025, 9:00:00 AM
Created: 3/13/2025, 9:00:00 AM
Updated: 3/13/2025, 9:20:33 AM

---

# Presentation Outline
- Introduction
- Project overview
- Timeline
- Budget
- Next steps

---

# Summary
Total notes requested: 3
Successfully retrieved: 3
```

> **Tip**: When you search for notes or view a notebook, you'll see a suggestion for using `read_multinote` with the exact IDs of the notes found. This makes it easy to read multiple related notes at once.

## Development

### Local Development Setup

To test the npx command locally during development:

```bash
# In the project root directory
cd /path/to/mcp-joplin
npm install
npm link
```

After linking, you can test your local changes immediately:

```bash
# Test the CLI
npx joplin-mcp-server --help
npx joplin-mcp-server --port 41184 --token your_token

# Make code changes, then test again (no rebuild needed)
npx joplin-mcp-server --help
```

### Making Changes

1. Edit any `.js` files in the project
2. Run tests: `npm test`
3. Test the CLI: `npx joplin-mcp-server --help`

No build step is required - changes are immediately available through the npm link.

### Running Tests

Create a `.env.test.local` file with your test configuration, then run:

```bash
npm test
```

### Publishing to npm

To make this package available via npx:

1. Update the version in `package.json`
2. Run `npm publish`

Users can then run it with `npx joplin-mcp-server`

### Unlinking (if needed)

To remove the local link:

```bash
npm unlink -g joplin-mcp-server
```

## License

MIT
