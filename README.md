# Joplin MCP Server

This is a Node.js implementation of an MCP (Model Context Protocol) server for Joplin.

## Quick Start

Install via npx (no installation required):

```bash
npx joplin-mcp-server --help
```

## Configuration

Create a `.env` file with the following variables:

```
JOPLIN_HOST=127.0.0.1
JOPLIN_PORT=41184
JOPLIN_TOKEN=your_joplin_token
```

You can find your Joplin token in the Joplin desktop app under:
Tools > Options > Web Clipper

### WSL (Windows Subsystem for Linux) Setup

If you're running the MCP server in WSL and Joplin on Windows, you'll need to set up port forwarding because Joplin binds to 127.0.0.1 (localhost only) by default.

#### Option 1: Windows Port Forwarding (Recommended)

This is the simplest solution that requires no Joplin configuration changes and persists across reboots.

**On Windows (PowerShell as Administrator)**:

```powershell
# Forward port 41184 to allow WSL access to Joplin
netsh interface portproxy add v4tov4 listenport=41184 listenaddress=0.0.0.0 connectport=41184 connectaddress=127.0.0.1

# Verify the port forward is active
netsh interface portproxy show all
```

**Configure your .env file in WSL**:

```bash
# Use your Windows machine's LAN IP address
JOPLIN_HOST=192.168.0.40  # Replace with your actual Windows IP
JOPLIN_PORT=41184
JOPLIN_TOKEN=your_joplin_token
```

**To find your Windows IP address**:

```bash
# From WSL
cat /etc/resolv.conf | grep nameserver | awk '{print $2}'
# This gives the WSL bridge IP (e.g., 10.255.255.254)

# Or use your Windows LAN IP (usually 192.168.x.x)
# Check in Windows: ipconfig (look for IPv4 Address)
```

**To remove the port forward later** (if needed):

```powershell
netsh interface portproxy delete v4tov4 listenport=41184 listenaddress=0.0.0.0
```

**Note**: This port forwarding rule persists across reboots - you only need to set it up once!

#### Option 2: Configure Joplin to Listen on All Interfaces (Alternative)

If you prefer to configure Joplin directly instead of using port forwarding:

1. **Find your Joplin configuration file**:
   - Windows: `C:\Users\YourUsername\.config\joplin-desktop\settings.json`

2. **Add this configuration to settings.json**:

   ```json
   {
     "clipperServer.host": "0.0.0.0"
   }
   ```

3. **Restart Joplin** for the changes to take effect

4. **Set your .env file in WSL**:
   ```
   JOPLIN_HOST=10.255.255.254  # WSL bridge IP from /etc/resolv.conf
   JOPLIN_PORT=41184
   JOPLIN_TOKEN=your_joplin_token
   ```

**Security Note**: This makes Joplin accessible on your entire local network. The API token is still required for all operations.

#### Troubleshooting WSL Connectivity

**Test connectivity from WSL**:

```bash
# Test if Joplin is reachable from WSL
curl http://192.168.0.40:41184/ping
# Should return: JoplinClipperServer

# If using WSL bridge IP:
curl http://10.255.255.254:41184/ping
```

**Common issues**:

- **Connection refused**: Port forwarding not set up or Joplin not running
  - Verify port forward: `netsh interface portproxy show all` (on Windows)
  - Verify Joplin is running with Web Clipper enabled
- **Connection timeout**: Windows Firewall is blocking the port
  - Open Windows Defender Firewall
  - Add Inbound Rule for TCP port 41184
- **Wrong IP**: Make sure you're using your actual Windows IP address
  - Check with `ipconfig` on Windows (look for IPv4 Address on your active network adapter)

## Command Line Options

```
OPTIONS:
  --env-file <file>    Load environment variables from file
  --host <hostname>    Joplin hostname or IP (default: 127.0.0.1)
  --port <port>        Joplin port (default: 41184)
  --token <token>      Joplin API token
  --transport <type>   Transport type: stdio (default) or http
  --http-port <port>   HTTP server port (default: 3000, only used with --transport http)
  --help, -h           Show help message
```

### Command Line Usage Examples

```bash
# Using command line arguments
npx joplin-mcp-server --token your_joplin_token

# Using environment file
npx joplin-mcp-server --env-file /path/to/your/.env

# WSL: Connect to Windows host
npx joplin-mcp-server --host 192.168.0.40 --token your_token

# HTTP mode (for testing with MCP Inspector)
npx joplin-mcp-server --transport http --token your_token
```

### MCP Client Configuration

#### Claude Desktop Configuration

**Important**: Claude Desktop does NOT support environment variable expansion (`${VAR}` syntax). You must provide values directly.

**Option 1: Using env Section (Recommended)**

Add to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "joplin": {
      "command": "npx",
      "args": ["joplin-mcp-server"],
      "env": {
        "JOPLIN_TOKEN": "your_actual_token_here",
        "JOPLIN_PORT": "41184",
        "JOPLIN_HOST": "127.0.0.1"
      }
    }
  }
}
```

**Option 2: Using Command-Line Arguments**

```json
{
  "mcpServers": {
    "joplin": {
      "command": "npx",
      "args": ["joplin-mcp-server", "--token", "your_actual_token_here", "--port", "41184", "--host", "127.0.0.1"]
    }
  }
}
```

Restart Claude Desktop after updating the configuration.

#### Claude Code Configuration

Claude Code supports environment variable expansion in `.mcp.json`.

**1. Set environment variables in your shell** (add to `~/.bashrc` or `~/.zshrc`):

```bash
export JOPLIN_TOKEN="your_actual_token_here"
export JOPLIN_PORT="41184"        # Optional, defaults to 41184
export JOPLIN_HOST="127.0.0.1"    # Optional, defaults to 127.0.0.1
```

**2. Use the included `.mcp.json` configuration**:

The repository includes a working `.mcp.json` file that uses environment variable expansion:

```json
{
  "mcpServers": {
    "joplin": {
      "command": "npx",
      "args": ["joplin-mcp-server"],
      "env": {
        "JOPLIN_TOKEN": "${JOPLIN_TOKEN}"
      }
    }
  }
}
```

The server will automatically use `JOPLIN_PORT` and `JOPLIN_HOST` from your shell environment, or use the defaults (127.0.0.1:41184).

#### Other MCP Clients (Cursor, etc.)

Most MCP clients support environment variable expansion (`${VAR}` syntax).

**With environment variables:**

```json
{
  "mcpServers": {
    "joplin": {
      "command": "npx",
      "args": ["joplin-mcp-server"],
      "env": {
        "JOPLIN_TOKEN": "${JOPLIN_TOKEN}",
        "JOPLIN_PORT": "${JOPLIN_PORT}",
        "JOPLIN_HOST": "${JOPLIN_HOST}"
      }
    }
  }
}
```

**With direct values:**

```json
{
  "mcpServers": {
    "joplin": {
      "command": "npx",
      "args": ["joplin-mcp-server", "--token", "your_joplin_token", "--port", "41184", "--host", "127.0.0.1"]
    }
  }
}
```

**Using environment file:**

```json
{
  "mcpServers": {
    "joplin": {
      "command": "npx",
      "args": ["joplin-mcp-server", "--env-file", "/path/to/your/.env"]
    }
  }
}
```

## Logging

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

```bash
# Install dependencies
pnpm install

# Build the project
pnpm build

# Run tests
pnpm test

# Format code
pnpm format

# Run linter
pnpm lint

# Run validation (format + lint + test + build)
pnpm validate
```

### Testing Local Changes

```bash
# Link for local development
npm link

# Test the CLI
npx joplin-mcp-server --help

# Unlink when done
npm unlink -g joplin-mcp-server
```

## License

MIT
