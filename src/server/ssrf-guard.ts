/**
 * SSRF (Server-Side Request Forgery) guard for the landing-page grader backend.
 *
 * Before the analysis pipeline ever fetches a user-supplied URL, that URL is run
 * through {@link checkUrl}. The guard defends the "load" stage against SSRF: it
 * refuses any target that would let the server reach itself or the private
 * network it lives in — loopback, RFC1918/ULA private ranges, link-local
 * (incl. the `169.254.169.254` cloud-metadata endpoint), the unspecified
 * address, and the literal `localhost`. A blocked check terminates the flow in
 * `error-load` upstream; the guard itself only returns a reason code and never
 * emits user-facing (localised) copy, so the UI layer owns the Korean message.
 *
 * DNS-rebinding is covered: hostnames are resolved and *every* resolved address
 * is classified, so `evil.example.com → 127.0.0.1` is blocked even though the
 * name looks public. Address parsing runs on the WHATWG-URL-normalised hostname,
 * which canonicalises octal/hex/dword IPv4 and compressed IPv6 forms, closing
 * the classic `http://0177.0.0.1/` style bypass before classification.
 *
 * The single escape hatch is the `ALLOW_PRIVATE_NETWORK` environment variable
 * (or an explicit `allowPrivateNetwork` option): when enabled, private targets
 * are permitted for on-prem / internal testing. URL *validity* is still
 * enforced under the bypass — the flag loosens address policy, not parsing.
 *
 * Boundary: standalone `src/server/` security module. It imports nothing from
 * `src/core`, `src/components`, or `src/state`; DNS is injected via a
 * {@link HostResolver} so the classification logic is unit-testable with no real
 * network. The default resolver is the only Node-specific surface.
 */

import { lookup } from 'node:dns/promises'

/**
 * Resolves a hostname to zero or more IP address strings. Injected so tests can
 * classify resolution outcomes deterministically without touching real DNS; the
 * production default ({@link nodeDnsResolver}) delegates to `dns.lookup`.
 */
export type HostResolver = (host: string) => Promise<string[]>

/** Why a URL was refused. Each maps to one class of guard failure. */
export type SsrfBlockReason =
  /** Not a parseable `http:`/`https:` URL. */
  | 'invalid-url'
  /** Hostname is the literal `localhost` (or a `*.localhost` name). */
  | 'blocked-host'
  /** Host, or a resolved address, is loopback / private / link-local. */
  | 'private-address'
  /** Hostname could not be resolved to any address. */
  | 'dns-failure'

/** A URL the guard permits the pipeline to fetch. */
export interface GuardAllowed {
  allowed: true
}

/** A URL the guard refuses, with a machine-readable reason for the UI to map. */
export interface GuardBlocked {
  allowed: false
  reason: SsrfBlockReason
  /** Short, non-localised technical note (never contains secrets/keys). */
  detail: string
}

/** Discriminated outcome of {@link checkUrl}. */
export type GuardResult = GuardAllowed | GuardBlocked

/** Options for {@link checkUrl}. */
export interface SsrfGuardOptions {
  /** DNS resolver to use. Defaults to {@link nodeDnsResolver}. */
  resolver?: HostResolver
  /**
   * When `true`, private / loopback / link-local targets (and `localhost`) are
   * allowed. Defaults to reading `ALLOW_PRIVATE_NETWORK` from the environment.
   */
  allowPrivateNetwork?: boolean
}

const ALLOWED = Object.freeze({ allowed: true } as const)

function block(reason: SsrfBlockReason, detail: string): GuardBlocked {
  return { allowed: false, reason, detail }
}

/** Recognised truthy spellings for the `ALLOW_PRIVATE_NETWORK` flag. */
const TRUTHY_FLAGS = new Set(['1', 'true', 'yes', 'on'])

/** Whether a raw env-flag string enables the private-network bypass. */
export function isTruthyFlag(value: string | undefined | null): boolean {
  if (!value) return false
  return TRUTHY_FLAGS.has(value.trim().toLowerCase())
}

/** Reads the `ALLOW_PRIVATE_NETWORK` bypass flag from the process environment. */
function envAllowsPrivateNetwork(): boolean {
  const raw =
    typeof process !== 'undefined' ? process.env?.ALLOW_PRIVATE_NETWORK : undefined
  return isTruthyFlag(raw)
}

/** Production {@link HostResolver}: resolves every A/AAAA record via Node DNS. */
export const nodeDnsResolver: HostResolver = async (host) => {
  const records = await lookup(host, { all: true })
  return records.map((record) => record.address)
}

/**
 * Parses a dotted-decimal IPv4 string into its four octets, or `null` if it is
 * not a strict `a.b.c.d` (each 0–255, decimal, no leading `+`/whitespace).
 */
export function parseIpv4(host: string): number[] | null {
  const parts = host.split('.')
  if (parts.length !== 4) return null
  const octets: number[] = []
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) return null
    const n = Number(part)
    if (n > 255) return null
    octets.push(n)
  }
  return octets
}

function hextetToNum(part: string): number | null {
  if (!/^[0-9a-fA-F]{1,4}$/.test(part)) return null
  return parseInt(part, 16)
}

/**
 * Parses an IPv6 string into its eight 16-bit hextets, or `null` if malformed.
 * Handles `::` zero-compression (at most once) and a trailing embedded IPv4
 * (e.g. `::ffff:127.0.0.1`). Input must be unbracketed.
 */
export function parseIpv6(input: string): number[] | null {
  if (!input.includes(':')) return null
  if ((input.match(/::/g) ?? []).length > 1) return null

  // Split off a trailing embedded IPv4 (dotted-quad) into two hextets.
  let head = input
  let tailV4: number[] = []
  if (input.includes('.')) {
    const lastColon = input.lastIndexOf(':')
    if (lastColon === -1) return null
    const v4 = parseIpv4(input.slice(lastColon + 1))
    if (!v4) return null
    tailV4 = [(v4[0] << 8) | v4[1], (v4[2] << 8) | v4[3]]
    head = input.slice(0, lastColon)
  }

  let hextets: number[]
  if (head.includes('::')) {
    const [left, right] = head.split('::')
    const leftParts = left === '' ? [] : left.split(':')
    const rightParts = right === '' ? [] : right.split(':')
    const leftNums = leftParts.map(hextetToNum)
    const rightNums = rightParts.map(hextetToNum)
    if ([...leftNums, ...rightNums].some((n) => n === null)) return null
    const known = leftParts.length + rightParts.length + tailV4.length
    if (known > 8) return null
    hextets = [
      ...(leftNums as number[]),
      ...new Array(8 - known).fill(0),
      ...(rightNums as number[]),
      ...tailV4,
    ]
  } else {
    const parts = head === '' ? [] : head.split(':')
    const nums = parts.map(hextetToNum)
    if (nums.some((n) => n === null)) return null
    hextets = [...(nums as number[]), ...tailV4]
  }

  return hextets.length === 8 ? hextets : null
}

/** Whether IPv4 octets fall in a loopback / private / link-local / unspecified range. */
function isBlockedIpv4(octets: number[]): boolean {
  const [a, b] = octets
  if (a === 0) return true // 0.0.0.0/8 — unspecified / "this host"
  if (a === 127) return true // 127.0.0.0/8 — loopback
  if (a === 10) return true // 10.0.0.0/8 — private
  if (a === 172 && b >= 16 && b <= 31) return true // 172.16.0.0/12 — private
  if (a === 192 && b === 168) return true // 192.168.0.0/16 — private
  if (a === 169 && b === 254) return true // 169.254.0.0/16 — link-local
  return false
}

/** Whether IPv6 hextets fall in a loopback / ULA / link-local / mapped-v4 range. */
function isBlockedIpv6(h: number[]): boolean {
  // Unspecified ::
  if (h.every((x) => x === 0)) return true
  // Loopback ::1
  if (h.slice(0, 7).every((x) => x === 0) && h[7] === 1) return true
  // Link-local fe80::/10
  if ((h[0] & 0xffc0) === 0xfe80) return true
  // Unique local address fc00::/7
  if ((h[0] & 0xfe00) === 0xfc00) return true
  // IPv4-mapped (::ffff:0:0/96) and IPv4-compatible (::/96): inspect embedded v4.
  const first5Zero = h[0] === 0 && h[1] === 0 && h[2] === 0 && h[3] === 0 && h[4] === 0
  if (first5Zero && (h[5] === 0xffff || h[5] === 0)) {
    const a = (h[6] >> 8) & 0xff
    const b = h[6] & 0xff
    const c = (h[7] >> 8) & 0xff
    const d = h[7] & 0xff
    return isBlockedIpv4([a, b, c, d])
  }
  return false
}

/**
 * Whether a raw IP string (v4 or v6, unbracketed) is loopback / private /
 * link-local and therefore an SSRF risk. Malformed input returns `false` (it is
 * not a recognised private address); callers treat unresolved hosts separately.
 */
export function isBlockedIp(ip: string): boolean {
  const v4 = parseIpv4(ip)
  if (v4) return isBlockedIpv4(v4)
  const v6 = parseIpv6(ip)
  if (v6) return isBlockedIpv6(v6)
  return false
}

/** Strips surrounding brackets and lowercases a URL hostname for classification. */
function normaliseHost(hostname: string): string {
  const unbracketed =
    hostname.startsWith('[') && hostname.endsWith(']')
      ? hostname.slice(1, -1)
      : hostname
  return unbracketed.toLowerCase()
}

function isLocalhostName(host: string): boolean {
  return host === 'localhost' || host.endsWith('.localhost')
}

/**
 * Validates a user-supplied URL against SSRF policy before the pipeline fetches
 * it. Resolves the host and classifies every address; returns an
 * {@link GuardAllowed} for safe public targets, or a {@link GuardBlocked} with a
 * reason code otherwise. Never throws for expected inputs (invalid URL, DNS
 * failure) — those are returned as block results.
 */
export async function checkUrl(
  rawUrl: string,
  options: SsrfGuardOptions = {},
): Promise<GuardResult> {
  let url: URL
  try {
    url = new URL(rawUrl)
  } catch {
    return block('invalid-url', 'URL could not be parsed')
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return block('invalid-url', `unsupported protocol: ${url.protocol}`)
  }

  const host = normaliseHost(url.hostname)
  if (host === '') {
    return block('invalid-url', 'URL has no host')
  }

  const allowPrivate = options.allowPrivateNetwork ?? envAllowsPrivateNetwork()
  if (allowPrivate) {
    // Bypass loosens address policy only; the URL is already validated above.
    return ALLOWED
  }

  if (isLocalhostName(host)) {
    return block('blocked-host', 'localhost is not an allowed target')
  }

  // IP literal: classify directly, no DNS needed.
  const v4 = parseIpv4(host)
  const v6 = v4 ? null : parseIpv6(host)
  if (v4 || v6) {
    return isBlockedIp(host)
      ? block('private-address', 'target IP is loopback/private/link-local')
      : ALLOWED
  }

  // Hostname: resolve and classify every address (DNS-rebinding defence).
  const resolver = options.resolver ?? nodeDnsResolver
  let addresses: string[]
  try {
    addresses = await resolver(host)
  } catch {
    return block('dns-failure', 'host could not be resolved')
  }

  if (addresses.length === 0) {
    return block('dns-failure', 'host resolved to no addresses')
  }

  for (const address of addresses) {
    if (isBlockedIp(address)) {
      return block('private-address', 'host resolves to a private address')
    }
  }

  return ALLOWED
}
