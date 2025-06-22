# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a TypeScript MCP (Model Context Protocol) server for Joplin note-taking application. It provides tools to interact with Joplin via its REST API, allowing users to search, read, create, edit, delete, and navigate notes and notebooks.

## Key Commands

- **Build**: `npm run build` (compiles TypeScript to dist/)
- **Development**: `npm start` (runs TypeScript directly with tsx)
- **Production**: `npm run start:js` (runs compiled JavaScript)
- **Type checking**: `npm run typecheck`
- **Formatting**: `npm run format` (Prettier)
- **Testing**:
  - `npm test` - Run all Vitest tests
  - `npm run test:ui` - Run tests with UI
  - `npm run test:coverage` - Generate coverage report
  - Manual tool tests: `npm run test:manual:search-notes`, `npm run test:manual:read-notebook`, etc.
- **Start via npx**:
  - `npx joplin-mcp-server --port 41184 --token your_token`
  - `npx joplin-mcp-server --env-file /path/to/.env`
- **Get help**: `npx joplin-mcp-server --help`

## Architecture

### Core Components

- **Main server** (`index.ts`): MCP server setup with tool registration and logging transport
- **API Client** (`lib/joplin-api-client.ts`): HTTP client for Joplin REST API with pagination support
- **Tools** (`lib/tools/`): Individual tool implementations that handle specific Joplin operations
  - 11 tools: list-notebooks, search-notes, read-notebook, read-note, read-multinote, create-note, create-notebook, edit-note, delete-note, delete-notebook, get-tags
- **Logger** (`lib/logger.ts`): Custom logging with configurable levels and file output
- **CLI Parser** (`lib/parse-args.ts`): Command-line argument processing
- **Transport** (`lib/transport.ts`): Custom LoggingTransport extends StdioServerTransport

### Tool Pattern

Each tool follows a consistent pattern:

- Extends from base Tool class
- Implements a `call()` method that takes typed parameters and returns formatted text
- Uses the JoplinAPIClient to make API requests
- Returns user-friendly formatted text responses
- Validates parameters using Zod schemas

### TypeScript Configuration

- Target: ES2022
- Module: ESNext with Node resolution
- Strict mode enabled
- Path aliases: `@/*` maps to `./src/*`
- Output directory: `./dist`

### Environment Configuration

Requires two environment variables:

- `JOPLIN_PORT`: Port where Joplin is running (default 41184)
- `JOPLIN_TOKEN`: API token from Joplin's Web Clipper settings

Use `--env-file` flag to specify custom environment file location.

### Testing Strategy

- **Framework**: Vitest
- **Configuration**: `vitest.config.ts`
- **Test Structure**:
  - Unit tests: `tests/unit/` - Test individual functions and classes
  - Integration tests: `tests/integration/` - Test API interactions
  - Manual tests: `tests/manual/` - Interactive testing of each tool
- **Setup**: `vitest.setup.ts` loads environment variables
- **Coverage**: V8 provider with HTML and text reporting

### Logging System

- Creates timestamped log files in `logs/` directory (gitignored)
- Logs both incoming commands and outgoing responses
- Configurable log levels via `LOG_LEVEL` environment variable (debug, info, warn, error)
- Custom LoggingTransport wrapper extends StdioServerTransport

### Development Workflow

1. Make changes to TypeScript files in `src/`
2. Run `npm run typecheck` to ensure type safety
3. Run `npm test` to execute tests
4. Run `npm run build` before publishing
5. Test CLI locally with `npm start` or `npm run start:js`

The project uses ES modules (`"type": "module"` in package.json) and modern TypeScript features.
