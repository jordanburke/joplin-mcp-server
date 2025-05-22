# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a Node.js MCP (Model Context Protocol) server for Joplin note-taking application. It provides tools to interact with Joplin via its REST API, allowing users to search, read, and navigate notes and notebooks.

## Key Commands

- **Start server locally**: `npm start`
- **Start via npx**: 
  - `npx joplin-mcp-server --port 41184 --token your_token`
  - `npx joplin-mcp-server --env-file /path/to/.env`
- **Get help**: `npx joplin-mcp-server --help`
- **Run tests**: `npm test` (requires `.env.test.local` with test configuration)
- **Individual tool tests**: 
  - `npm run test:search`
  - `npm run test:read-notebook`
  - `npm run test:read-note`
  - `npm run test:read-multinote`

## Architecture

### Core Components

- **Main server** (`index.js`): MCP server setup with tool registration and logging transport
- **API Client** (`lib/joplin-api-client.js`): HTTP client for Joplin REST API with pagination support
- **Tools** (`lib/tools/`): Individual tool implementations that handle specific Joplin operations
- **Logger** (`lib/logger.js`): Custom logging with configurable levels and file output

### Tool Pattern

Each tool follows a consistent pattern:
- Import and extend from the base tool class
- Implement a `call()` method that takes parameters and returns formatted text
- Use the JoplinAPIClient to make API requests
- Return user-friendly formatted text responses

### Environment Configuration

Requires two environment variables:
- `JOPLIN_PORT`: Port where Joplin is running (default 41184)
- `JOPLIN_TOKEN`: API token from Joplin's Web Clipper settings

Use `--env-file` flag to specify custom environment file location.

### Logging System

- Creates timestamped log files in `logs/` directory
- Logs both incoming commands and outgoing responses
- Configurable log levels via `LOG_LEVEL` environment variable (debug, info, warn, error)
- Custom LoggingTransport wrapper extends StdioServerTransport

### Testing

Uses Node.js built-in test runner with `.env.test.local` for test configuration. Tests require actual Joplin instance running with API enabled.