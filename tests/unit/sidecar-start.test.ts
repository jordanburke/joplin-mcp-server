import { Right } from "functype"
import { describe, expect, it, vi } from "vitest"

import { JoplinSidecar } from "../../src/lib/joplin-sidecar.js"

type Internals = {
  doStart: () => Promise<unknown>
  sidecarAlive: () => boolean
}

const makeSidecar = (): { sidecar: JoplinSidecar; internals: Internals } => {
  const sidecar = new JoplinSidecar({ profileDir: "/nonexistent/joplin-mcp-test", apiPort: 41184, apiToken: "t" })
  return { sidecar, internals: sidecar as unknown as Internals }
}

describe("JoplinSidecar.start", () => {
  it("shares a start that is still in flight instead of spawning a second server", async () => {
    const { sidecar, internals } = makeSidecar()
    let finish: (value: unknown) => void = () => undefined
    internals.doStart = vi.fn(() => new Promise((resolve) => (finish = resolve)))
    // Nothing answers yet while the first start is still spawning.
    internals.sidecarAlive = vi.fn(() => false)

    const first = sidecar.start()
    const second = sidecar.start()
    finish(Right("child"))

    expect(await first).toEqual(await second)
    expect(internals.doStart).toHaveBeenCalledTimes(1)
  })

  it("restarts once a settled start's server has died", async () => {
    const { sidecar, internals } = makeSidecar()
    internals.doStart = vi.fn(() => Promise.resolve(Right("child")))
    internals.sidecarAlive = vi.fn(() => false)

    await sidecar.start()
    await sidecar.start()

    expect(internals.doStart).toHaveBeenCalledTimes(2)
  })

  it("reuses a settled start while its server is alive", async () => {
    const { sidecar, internals } = makeSidecar()
    internals.doStart = vi.fn(() => Promise.resolve(Right("child")))
    internals.sidecarAlive = vi.fn(() => true)

    await sidecar.start()
    await sidecar.start()

    expect(internals.doStart).toHaveBeenCalledTimes(1)
  })
})
