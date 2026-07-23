import type { Option } from "functype"

export type TokenSource = "explicit" | "external-env" | "external-generated" | "profile"

export type TokenResolution = {
  // Which channel supplied the token — see TokenSource. Callers use this to know
  // whether to read/persist the profile token and whether to warn.
  source: TokenSource
  // True when an ambient JOPLIN_TOKEN was present but ignored (sidecar mode).
  ambientIgnored: boolean
}

export type ResolveTokenInput = {
  externalMode: boolean
  explicitToken: Option<string>
  ambientToken: Option<string>
}

// Decides where a Joplin token comes from, without performing any I/O.
//
// The token means different things per mode. In external mode it is a guest
// credential for a Joplin we do not own, so a caller must supply it. In sidecar
// mode we own the instance and mint the token in the profile; an explicit --token
// still wins, but an ambient JOPLIN_TOKEN is ignored so that several sidecar
// processes sharing a profile agree on one token without env coordination.
export const resolveTokenSource = (input: ResolveTokenInput): TokenResolution => {
  if (input.explicitToken.isEmpty === false) {
    return { source: "explicit", ambientIgnored: false }
  }
  if (input.externalMode) {
    return {
      source: input.ambientToken.isEmpty === false ? "external-env" : "external-generated",
      ambientIgnored: false,
    }
  }
  return { source: "profile", ambientIgnored: input.ambientToken.isEmpty === false }
}

// External mode requires a caller-supplied token; sidecar mode never does.
export const externalTokenMissing = (input: ResolveTokenInput): boolean =>
  input.externalMode && input.explicitToken.isEmpty && input.ambientToken.isEmpty
