# Joplin MCP Server

A self-contained MCP (Model Context Protocol) server for [Joplin](https://joplinapp.org/). Bundles the Joplin Terminal CLI as a dependency — no desktop app, no global installs, no external processes to manage.

## Quick Start

```bash
npx joplin-mcp-server --token your_joplin_token
```

That's it. The server spawns its own Joplin Terminal instance (sidecar mode), syncs to your configured backend, and exposes your notes via MCP.

## Architecture

### Sidecar Mode (Default)

The server bundles `joplin` as an npm dependency and manages its own Joplin Terminal process. No Joplin desktop app needed — the sidecar handles everything: data storage, sync, and the REST API.

```bash
# Basic usage — sidecar starts automatically
npx joplin-mcp-server --token your_token

# With cloud sync
npx joplin-mcp-server --token your_token \
  --sync-target joplin-cloud \
  --sync-username user@example.com --sync-password pass

# With filesystem sync (e.g. OneDrive folder)
npx joplin-mcp-server --token your_token \
  --sync-target filesystem \
  --sync-path /mnt/c/Users/you/OneDrive/Joplin
```

The Joplin CLI is resolved in this order: `JOPLIN_CLI` env var > `node_modules/.bin/joplin` (bundled) > global install > `npx` fallback.

Data is stored in `~/.config/joplin-mcp` by default (separate from any desktop Joplin install).

### External Mode

Connects to an existing Joplin instance instead of spawning a sidecar. Activated by setting `JOPLIN_HOST` or `JOPLIN_PORT`.

```bash
# Connect to Joplin desktop on another machine or Windows host
JOPLIN_HOST=192.168.0.40 JOPLIN_PORT=41184 npx joplin-mcp-server --token your_token
```

## Configuration

### Environment Variables

| Variable               | Description                                             | Default                |
| ---------------------- | ------------------------------------------------------- | ---------------------- |
| `JOPLIN_TOKEN`         | API token (required)                                    | --                     |
| `JOPLIN_HOST`          | Connect to existing Joplin at this host (skips sidecar) | --                     |
| `JOPLIN_PORT`          | Connect to existing Joplin on this port (skips sidecar) | --                     |
| `JOPLIN_CLI`           | Path to joplin CLI binary (overrides auto-detection)    | --                     |
| `JOPLIN_PROFILE`       | Joplin data directory for sidecar mode                  | `~/.config/joplin-mcp` |
| `JOPLIN_SYNC_TARGET`   | Sync target type                                        | `none`                 |
| `JOPLIN_SYNC_PATH`     | Sync target URL/path                                    | --                     |
| `JOPLIN_SYNC_USERNAME` | Sync username/email                                     | --                     |
| `JOPLIN_SYNC_PASSWORD` | Sync password                                           | --                     |
| `LOG_LEVEL`            | Log level: debug, info, warn, error                     | `info`                 |

### Command Line Options

```
OPTIONS:
  --env-file <file>          Load environment variables from file
  --token <token>            Joplin API token
  --transport <type>         Transport type: stdio (default) or http
  --http-port <port>         HTTP server port (default: 3000, only with --transport http)
  --profile <dir>            Joplin data directory (default: ~/.config/joplin-mcp)
  --sync-target <type>       Sync target: none, filesystem, webdav, nextcloud,
                             joplin-cloud, joplin-server, s3, dropbox, onedrive
  --sync-path <url>          URL or path for sync target
  --sync-username <user>     Username/email for sync
  --sync-password <pass>     Password for sync
  --help, -h                 Show help message
```

### Sync Targets

| Target          | Required Options                                                                     |
| --------------- | ------------------------------------------------------------------------------------ |
| `none`          | (default, no sync)                                                                   |
| `filesystem`    | `--sync-path /path/to/dir`                                                           |
| `webdav`        | `--sync-path <url>` `--sync-username` `--sync-password`                              |
| `nextcloud`     | `--sync-path <url>` `--sync-username` `--sync-password`                              |
| `joplin-cloud`  | `--sync-username` `--sync-password`                                                  |
| `joplin-server` | `--sync-path <url>` `--sync-username` `--sync-password`                              |
| `s3`            | `--sync-path <bucket>` `--sync-username <access-key>` `--sync-password <secret-key>` |
| `dropbox`       | (OAuth flow)                                                                         |
| `onedrive`      | (OAuth flow)                                                                         |

## MCP Client Configuration

### Claude Code

The repository includes a `.mcp.json` that works with Claude Code's env var expansion:

```json
{
  "mcpServers": {
    "joplin": {
      "command": "node",
      "args": ["dist/bin.js"],
      "env": {
        "JOPLIN_TOKEN": "${JOPLIN_TOKEN}"
      }
    }
  }
}
```

Set `JOPLIN_TOKEN` in your shell (add to `~/.bashrc` or `~/.zshrc`):

```bash
export JOPLIN_TOKEN="your_actual_token_here"
```

### Claude Desktop

Claude Desktop does **not** support `${VAR}` expansion. Provide values directly:

```json
{
  "mcpServers": {
    "joplin": {
      "command": "npx",
      "args": ["joplin-mcp-server", "--token", "your_actual_token_here"]
    }
  }
}
```

### With Sync (Claude Desktop)

```json
{
  "mcpServers": {
    "joplin": {
      "command": "npx",
      "args": [
        "joplin-mcp-server",
        "--token",
        "your_token",
        "--sync-target",
        "filesystem",
        "--sync-path",
        "/path/to/sync/dir"
      ]
    }
  }
}
```

### External Mode

```json
{
  "mcpServers": {
    "joplin": {
      "command": "npx",
      "args": ["joplin-mcp-server"],
      "env": {
        "JOPLIN_TOKEN": "your_actual_token_here",
        "JOPLIN_HOST": "192.168.0.40",
        "JOPLIN_PORT": "41184"
      }
    }
  }
}
```

### Docker

```bash
docker build -t joplin-mcp .
docker run -e JOPLIN_TOKEN=your_token -p 3000:3000 joplin-mcp
```

## WSL Setup

Running in WSL? The sidecar architecture makes this straightforward — no Windows port forwarding needed.

### Filesystem Sync via OneDrive (Recommended)

Both your Windows Joplin desktop and the WSL sidecar sync to the same OneDrive folder. They see the same notes without needing to talk to each other directly.

```bash
# Point the sidecar at your OneDrive Joplin sync folder
npx joplin-mcp-server --token your_token \
  --sync-target filesystem \
  --sync-path /mnt/c/Users/YourName/OneDrive/Joplin
```

In your Joplin desktop app, configure sync to the same OneDrive folder: **Tools > Options > Synchronisation > File system > /Users/YourName/OneDrive/Joplin**

### Cloud Sync

Alternatively, both instances can sync to Joplin Cloud or any other cloud backend:

```bash
npx joplin-mcp-server --token your_token \
  --sync-target joplin-cloud \
  --sync-username user@example.com --sync-password pass
```

### External Mode (Port Forwarding)

If you prefer to connect directly to Windows Joplin instead of running a sidecar:

**On Windows (PowerShell as Administrator):**

```powershell
netsh interface portproxy add v4tov4 listenport=41184 listenaddress=0.0.0.0 connectport=41184 connectaddress=127.0.0.1
```

**In WSL:**

```bash
JOPLIN_HOST=192.168.0.40 JOPLIN_PORT=41184 npx joplin-mcp-server --token your_token
```

Find your Windows IP with `ipconfig` on Windows or `cat /etc/resolv.conf | grep nameserver` from WSL.

## Available Tools

| Tool             | Description                               |
| ---------------- | ----------------------------------------- |
| `list_notebooks` | Retrieve the complete notebook hierarchy  |
| `search_notes`   | Search for notes by query string          |
| `read_notebook`  | Read contents of a specific notebook      |
| `read_note`      | Read full content of a specific note      |
| `read_multinote` | Read multiple notes at once               |
| `create_note`    | Create a new note                         |
| `create_folder`  | Create a new notebook                     |
| `edit_note`      | Edit an existing note                     |
| `edit_folder`    | Edit an existing notebook                 |
| `delete_note`    | Delete a note (requires confirmation)     |
| `delete_folder`  | Delete a notebook (requires confirmation) |

## Development

```bash
pnpm install          # Install dependencies
pnpm build            # Build to dist/
pnpm test             # Run tests
pnpm validate         # Format + lint + typecheck + test + build
pnpm serve:dev        # Dev mode with hot reload (stdio)
pnpm serve:dev:http   # Dev mode with hot reload (HTTP)
pnpm inspect          # Build and open MCP Inspector
```

## License

MIT
