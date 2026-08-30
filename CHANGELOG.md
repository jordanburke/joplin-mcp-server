# Changelog

All notable changes to this project are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- CI now fails a build that would publish a package missing a file the previous release
  shipped (`pnpm check:package`). Build-hash suffixes are normalized so a rebuilt chunk
  does not read as a loss, and an unpublished package skips rather than fails. Runs in
  `ci.yml` on pushes and PRs, and in `publish.yml` immediately before `npm publish`.

## [2.3.1] - 2026-08-30

### Fixed

- `manifest.json` is published again. It was dropped from the `files` array in
  `package.json` and so was absent from the 2.3.0 tarball, breaking the MCPB bundle that
  2.2.2 added. The `build:mcpb` script was lost the same way and is also restored.
- The MCPB manifest's version is now derived from `package.json` at build time instead of
  being copied verbatim. That field was maintained by hand and had already gone stale.

## [2.3.0] - 2026-08-30

### Added

- S3-compatible storage providers — Backblaze B2, MinIO, Cloudflare R2, Wasabi ([#9]).
  Three new options, each with an environment fallback:
  - `--sync-region` / `JOPLIN_SYNC_REGION` (default `us-east-1`)
  - `--sync-endpoint` / `JOPLIN_SYNC_ENDPOINT` (default `https://s3.amazonaws.com/`)
  - `--sync-force-path-style` / `JOPLIN_SYNC_FORCE_PATH_STYLE` (default `false`)

  The `s3` target previously pinned the region to `us-east-1` and never wrote Joplin's
  `sync.8.url`, so every request went to AWS regardless of the bucket. Defaults match
  Joplin's own, so existing AWS setups are unaffected. The endpoint is validated at parse
  time rather than failing later inside a sync run.

### Fixed

- `--sync-path` was variable-expanded for every sync target, so a `$` inside a WebDAV,
  Nextcloud, or Joplin Server URL was rewritten to an empty string. Expansion now applies
  only to the `filesystem` target.
- `npx joplin-mcp-server --help` listed no sync options at all. `bin.ts` carried its own
  abbreviated help that shadowed the full text; both entry points now share one module.

## [2.2.2] - 2026-07-27

### Added

- MCPB bundle: `manifest.json` and a `build:mcpb` script that packs a self-contained
  bundle including the Joplin CLI the sidecar spawns ([#8]).

## [2.2.1] - 2026-07-24

### Fixed

- The `sync` tool now actually syncs in sidecar mode ([#7]).

## [2.2.0] - 2026-07-23

### Changed

- The sidecar runs against the correct profile, shares one Joplin instance across MCP
  clients, and the token workflow is simplified ([#6]).
- CI and publish run on Node 24, which fixes npm OIDC trusted publishing ([#5]).
- Upgraded to ts-builds 3.2.1 and pnpm 11 ([#4]).

## [2.1.1] - 2026-05-25

### Fixed

- Write tools surfaced failures as successful responses containing an error string, so
  agents treated failed writes as having succeeded ([#2]). All tools now raise real MCP
  errors carrying Joplin's own message.

### Changed

- Path expansion and platform detection moved to `functype-os`.

## [2.1.0] - 2026-02-22

Earlier releases predate this changelog; see the
[release history](https://github.com/jordanburke/joplin-mcp-server/releases) for details.

[unreleased]: https://github.com/jordanburke/joplin-mcp-server/compare/v2.3.1...HEAD
[2.3.1]: https://github.com/jordanburke/joplin-mcp-server/compare/v2.3.0...v2.3.1
[2.3.0]: https://github.com/jordanburke/joplin-mcp-server/compare/v2.2.2...v2.3.0
[2.2.2]: https://github.com/jordanburke/joplin-mcp-server/compare/v2.2.1...v2.2.2
[2.2.1]: https://github.com/jordanburke/joplin-mcp-server/compare/v2.2.0...v2.2.1
[2.2.0]: https://github.com/jordanburke/joplin-mcp-server/compare/v2.1.1...v2.2.0
[2.1.1]: https://github.com/jordanburke/joplin-mcp-server/compare/v2.1.0...v2.1.1
[2.1.0]: https://github.com/jordanburke/joplin-mcp-server/releases/tag/v2.1.0
[#2]: https://github.com/jordanburke/joplin-mcp-server/issues/2
[#4]: https://github.com/jordanburke/joplin-mcp-server/pull/4
[#5]: https://github.com/jordanburke/joplin-mcp-server/pull/5
[#6]: https://github.com/jordanburke/joplin-mcp-server/pull/6
[#7]: https://github.com/jordanburke/joplin-mcp-server/pull/7
[#8]: https://github.com/jordanburke/joplin-mcp-server/pull/8
[#9]: https://github.com/jordanburke/joplin-mcp-server/issues/9
