# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a TypeScript MCP (Model Context Protocol) server for Joplin note-taking application. It provides tools to interact with Joplin via its REST API, allowing users to search, read, create, edit, delete, and navigate notes and notebooks.

## Key Commands

- **Build**: `pnpm build` - Compiles TypeScript to dist/ (CommonJS format)
- **Development**: `pnpm serve:dev:http` - Run in HTTP mode with hot reload
- **Type checking**: `pnpm typecheck` - Validate TypeScript types
- **Formatting**: `pnpm format` - Format code with Prettier
- **Linting**: `pnpm lint` - Run ESLint with auto-fix
- **Testing**: `pnpm test` - Run all Vitest tests
- **Validation**: `pnpm validate` - Run format + lint + test + build
- **CLI Usage**: `npx joplin-mcp-server --help` - Get help

## Architecture

### Core Components

- **Main server** (`src/index.ts`): Entry point supporting stdio and HTTP transports
- **Server Implementations**:
  - `src/server-core.ts`: Core MCP server with stdio transport
  - `src/server-fastmcp.ts`: FastMCP HTTP server with health checks and stateless mode
- **API Client** (`src/lib/joplin-api-client.ts`): HTTP client for Joplin REST API with pagination
- **Tools** (`src/lib/tools/`): 11 Joplin tools following consistent BaseTool pattern
  - list-notebooks, search-notes, read-notebook, read-note, read-multinote
  - create-note, create-folder, edit-note, edit-folder, delete-note, delete-folder
- **CLI** (`src/bin.ts`): CLI entry point for npx execution
- **Utilities**:
  - `src/lib/parse-args.ts`: Command-line argument and environment variable parsing
  - `src/lib/logger.ts`: Configurable logging with file output

### Tool Pattern

Each tool follows a consistent pattern:

- Extends from `BaseTool` class (`lib/tools/base-tool.ts`)
- Implements a `call()` method that takes typed parameters and returns formatted text
- Uses the JoplinAPIClient to make API requests
- Returns user-friendly formatted text responses
- Validates parameters using Zod schemas in the server registration
- Includes parameter validation with helpful error messages (e.g., `validateId()`)

### Build Configuration

- **Format**: CommonJS (`.js` files in dist/)
- **TypeScript**: Target ES2022, strict mode enabled
- **Builder**: tsup with dual entry points (index and bin)
- **Output**: `dist/` directory
- **Source maps**: Generated for debugging

### Environment Configuration

Environment variables (all optional with sensible defaults):

- `JOPLIN_HOST`: Joplin hostname/IP (default: 127.0.0.1)
- `JOPLIN_PORT`: Joplin port (default: 41184)
- `JOPLIN_TOKEN`: API token from Joplin Web Clipper (required)
- `LOG_LEVEL`: Logging verbosity (debug, info, warn, error)

Can be set via `.env` file, shell environment, or command-line arguments.

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

1. Make changes to TypeScript files in `src/`
2. Run `pnpm validate` to check everything (format + lint + test + build)
3. Test HTTP mode: `pnpm serve:dev:http`
4. Test with MCP Inspector at `http://localhost:3000/mcp`
5. Link for local testing: `npm link && npx joplin-mcp-server --help`

### Code Style

The project uses Prettier with the following configuration:

- No semicolons
- Trailing commas
- Double quotes
- 120 character line width
- 2 space indentation
