# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a TypeScript MCP (Model Context Protocol) server for Joplin note-taking application. It provides tools to interact with Joplin via its REST API, allowing users to search, read, create, edit, delete, and navigate notes and notebooks.

## Key Commands

- **Build**: `npm run build` (compiles TypeScript to dist/)
- **Development**: `npm start` (runs TypeScript directly with tsx)
- **Production**: `npm run start:js` (runs compiled JavaScript)
- **Type checking**: `npm run typecheck`
- **Formatting**: `npm run format` (Prettier) / `npm run format:check` (check only)
- **Clean build**: `npm run clean` (removes dist/)
- **Testing**:
  - `npm test` - Run all Vitest tests
  - `npm run test:ui` - Run tests with UI
  - `npm run test:run` - Run tests once
  - `npm run test:coverage` - Generate coverage report
  - Manual tool tests: `npm run test:manual:search`, `npm run test:manual:read-note`, etc.
- **Publishing**: `npm run prepublishOnly` (clean + build)
- **Start via npx**:
  - `npx joplin-mcp-server --port 41184 --token your_token`
  - `npx joplin-mcp-server --env-file /path/to/.env`
- **Get help**: `npx joplin-mcp-server --help`

## Architecture

### Core Components

- **Main server** (`index.ts`): MCP server setup with tool registration and inline LoggingTransport class
- **API Client** (`lib/joplin-api-client.ts`): HTTP client for Joplin REST API with pagination support
- **Tools** (`lib/tools/`): Individual tool implementations that handle specific Joplin operations
  - 11 tools: list-notebooks, search-notes, read-notebook, read-note, read-multinote, create-note, create-folder, edit-note, edit-folder, delete-note, delete-folder
- **Logger** (`lib/logger.ts`): Custom logging with configurable levels and file output
- **CLI Parser** (`lib/parse-args.ts`): Command-line argument processing
- **CLI Entry** (`bin/cli.ts`): ESM-compatible shebang script for npx execution

### Tool Pattern

Each tool follows a consistent pattern:

- Extends from `BaseTool` class (`lib/tools/base-tool.ts`)
- Implements a `call()` method that takes typed parameters and returns formatted text
- Uses the JoplinAPIClient to make API requests
- Returns user-friendly formatted text responses
- Validates parameters using Zod schemas in the server registration
- Includes parameter validation with helpful error messages (e.g., `validateId()`)

### TypeScript Configuration

- Target: ES2022
- Module: ESNext with Node resolution
- Strict mode enabled with all strict checks
- Path aliases: `@/*` maps to `./*` (project root)
- Output directory: `./dist`
- ES modules enabled (`"type": "module"` in package.json)

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
  - Manual tests: `tests/manual/` - Interactive testing of each tool (excluded from automated tests)
- **Setup**: `vitest.setup.ts` loads environment variables
- **Coverage**: V8 provider with HTML and text reporting

### Logging System

- Creates timestamped log files in `logs/` directory (gitignored)
- Logs both incoming commands and outgoing responses via custom `LoggingTransport` class
- Configurable log levels via `LOG_LEVEL` environment variable (debug, info, warn, error)
- LoggingTransport extends StdioServerTransport and intercepts messages for logging

### Development Workflow

1. Make changes to TypeScript files
2. Run `npm run typecheck` to ensure type safety
3. Run `npm test` to execute unit and integration tests
4. Run `npm run format` to format code with Prettier
5. Test manual tool operations with `npm run test:manual:*` commands
6. Run `npm run build` before publishing
7. Test CLI locally with `npm start` or `npm run start:js`

### Code Style

The project uses Prettier with the following configuration:

- No semicolons
- Trailing commas
- Double quotes
- 120 character line width
- 2 space indentation
