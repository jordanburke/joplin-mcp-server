import { Either, Option } from "functype"
import { describe, expect, it } from "vitest"

import { buildSettingsRecord } from "../../src/lib/joplin-sidecar.js"
import { buildSyncTarget } from "../../src/lib/parse-args.js"

type BuildArgs = Parameters<typeof buildSyncTarget>[0]

const noArgs: BuildArgs = {
  syncTarget: Option.none<string>(),
  syncPath: Option.none<string>(),
  syncUsername: Option.none<string>(),
  syncPassword: Option.none<string>(),
  syncRegion: Option.none<string>(),
  syncEndpoint: Option.none<string>(),
  syncForcePathStyle: Option.none<string>(),
}

const build = (overrides: Partial<BuildArgs>) => buildSyncTarget({ ...noArgs, ...overrides })

const rightOrThrow = <A>(result: Either<string, A>): A =>
  result.fold(
    (err) => {
      throw new Error(`expected Right, got Left: ${err}`)
    },
    (value) => value,
  )

const leftOrThrow = <A>(result: Either<string, A>): string =>
  result.fold(
    (err) => err,
    () => {
      throw new Error("expected Left, got Right")
    },
  )

const s3Credentials = {
  syncTarget: Option("s3"),
  syncPath: Option("my-bucket"),
  syncUsername: Option("access-key"),
  syncPassword: Option("secret-key"),
}

describe("buildSyncTarget s3", () => {
  it("applies Joplin's AWS defaults when no region or endpoint is given", () => {
    const target = rightOrThrow(build(s3Credentials))

    expect(target).toEqual({
      type: "s3",
      bucket: "my-bucket",
      region: "us-east-1",
      url: "https://s3.amazonaws.com/",
      forcePathStyle: false,
      accessKey: "access-key",
      secretKey: "secret-key",
    })
  })

  it("carries a custom endpoint, region and path style through (Backblaze B2)", () => {
    const target = rightOrThrow(
      build({
        ...s3Credentials,
        syncRegion: Option("us-west-004"),
        syncEndpoint: Option("https://s3.us-west-004.backblazeb2.com"),
        syncForcePathStyle: Option("true"),
      }),
    )

    expect(target).toMatchObject({
      region: "us-west-004",
      url: "https://s3.us-west-004.backblazeb2.com",
      forcePathStyle: true,
    })
  })

  it.each([
    ["true", true],
    ["1", true],
    ["TRUE", true],
    ["false", false],
    ["0", false],
  ])("parses --sync-force-path-style %s as %s", (raw, expected) => {
    const target = rightOrThrow(build({ ...s3Credentials, syncForcePathStyle: Option(raw) }))

    expect(target).toMatchObject({ forcePathStyle: expected })
  })

  it("rejects a non-boolean --sync-force-path-style", () => {
    const err = leftOrThrow(build({ ...s3Credentials, syncForcePathStyle: Option("yes") }))

    expect(err).toContain("--sync-force-path-style must be true or false")
  })

  it("rejects a malformed endpoint at parse time", () => {
    const err = leftOrThrow(build({ ...s3Credentials, syncEndpoint: Option("not-a-url") }))

    expect(err).toContain("--sync-endpoint must be a valid URL")
  })

  it.each([
    ["syncPath", "--sync-path (bucket) required"],
    ["syncUsername", "--sync-username (access key) required"],
    ["syncPassword", "--sync-password (secret key) required"],
  ])("requires %s", (missing, message) => {
    const err = leftOrThrow(build({ ...s3Credentials, [missing]: Option.none<string>() }))

    expect(err).toContain(message)
  })
})

describe("buildSyncTarget other targets", () => {
  it("leaves a filesystem path unexpanded (expansion happens after dispatch)", () => {
    const target = rightOrThrow(build({ syncTarget: Option("filesystem"), syncPath: Option("~/notes") }))

    expect(target).toEqual({ type: "filesystem", path: "~/notes" })
  })

  it("ignores s3-only options for non-s3 targets", () => {
    const target = rightOrThrow(
      build({
        syncTarget: Option("webdav"),
        syncPath: Option("https://dav.example.com/joplin"),
        syncUsername: Option("user"),
        syncPassword: Option("pass"),
        syncEndpoint: Option("https://s3.example.com"),
        syncForcePathStyle: Option("true"),
      }),
    )

    expect(target).toEqual({
      type: "webdav",
      url: "https://dav.example.com/joplin",
      username: "user",
      password: "pass",
    })
  })

  it("defaults to none", () => {
    expect(rightOrThrow(build({}))).toEqual({ type: "none" })
  })

  it("rejects an unknown target", () => {
    expect(leftOrThrow(build({ syncTarget: Option("gdrive") }))).toContain("Unknown sync target: gdrive")
  })
})

describe("buildSettingsRecord", () => {
  const base = { profileDir: "/tmp/profile", apiPort: 41184, apiToken: "token" }

  it("writes every sync.8.* key for s3, defaults included", () => {
    const settings = buildSettingsRecord({
      ...base,
      syncTarget: {
        type: "s3",
        bucket: "my-bucket",
        region: "us-east-1",
        url: "https://s3.amazonaws.com/",
        forcePathStyle: false,
        accessKey: "access-key",
        secretKey: "secret-key",
      },
    })

    expect(settings).toMatchObject({
      "sync.target": "8",
      "sync.8.path": "my-bucket",
      "sync.8.region": "us-east-1",
      "sync.8.url": "https://s3.amazonaws.com/",
      "sync.8.forcePathStyle": "false",
      "sync.8.username": "access-key",
      "sync.8.password": "secret-key",
    })
  })

  it("writes a custom endpoint and path style", () => {
    const settings = buildSettingsRecord({
      ...base,
      syncTarget: {
        type: "s3",
        bucket: "my-bucket",
        region: "us-west-004",
        url: "https://s3.us-west-004.backblazeb2.com",
        forcePathStyle: true,
        accessKey: "access-key",
        secretKey: "secret-key",
      },
    })

    expect(settings["sync.8.url"]).toBe("https://s3.us-west-004.backblazeb2.com")
    expect(settings["sync.8.forcePathStyle"]).toBe("true")
  })

  it("emits no sync.8.* keys for a non-s3 target", () => {
    const settings = buildSettingsRecord({
      ...base,
      syncTarget: { type: "filesystem", path: "/mnt/sync/joplin" },
    })

    expect(Object.keys(settings).filter((key) => key.startsWith("sync.8."))).toEqual([])
    expect(settings["sync.2.path"]).toBe("/mnt/sync/joplin")
  })
})
