import { describe, expect, it, vi } from 'vitest'
import {
  checkUrl,
  isBlockedIp,
  isTruthyFlag,
  parseIpv4,
  parseIpv6,
  type GuardResult,
  type HostResolver,
} from './ssrf-guard'

/**
 * The SSRF guard is the load-stage security boundary: it must block any target
 * that would let the server reach itself or its private network, while letting
 * genuine public landing pages through. These tests pin the Done-when matrix —
 * loopback, RFC1918 private ranges, link-local (incl. the cloud-metadata
 * `169.254.169.254`), IPv6 `::1`, and the literal `localhost` are blocked;
 * public hosts are allowed; and the `ALLOW_PRIVATE_NETWORK` override path opens
 * private targets. DNS is injected so classification is deterministic and
 * network-free, including the DNS-rebinding case.
 */

/** A resolver that always yields the given fixed addresses. */
function fixedResolver(...addresses: string[]): HostResolver {
  return async () => addresses
}

/** Asserts a guard result blocked with the expected reason. */
function expectBlocked(result: GuardResult, reason: string): void {
  expect(result.allowed).toBe(false)
  if (result.allowed === false) {
    expect(result.reason).toBe(reason)
  }
}

describe('parseIpv4', () => {
  it('parses valid dotted-decimal addresses', () => {
    expect(parseIpv4('127.0.0.1')).toEqual([127, 0, 0, 1])
    expect(parseIpv4('8.8.8.8')).toEqual([8, 8, 8, 8])
    expect(parseIpv4('255.255.255.255')).toEqual([255, 255, 255, 255])
  })

  it('rejects malformed or out-of-range addresses', () => {
    expect(parseIpv4('256.0.0.1')).toBeNull()
    expect(parseIpv4('1.2.3')).toBeNull()
    expect(parseIpv4('1.2.3.4.5')).toBeNull()
    expect(parseIpv4('a.b.c.d')).toBeNull()
    expect(parseIpv4('example.com')).toBeNull()
  })
})

describe('parseIpv6', () => {
  it('parses compressed and full forms', () => {
    expect(parseIpv6('::1')).toEqual([0, 0, 0, 0, 0, 0, 0, 1])
    expect(parseIpv6('::')).toEqual([0, 0, 0, 0, 0, 0, 0, 0])
    expect(parseIpv6('2001:db8::1')).toEqual([0x2001, 0xdb8, 0, 0, 0, 0, 0, 1])
    expect(parseIpv6('fe80::1')).toEqual([0xfe80, 0, 0, 0, 0, 0, 0, 1])
  })

  it('parses an embedded IPv4 tail', () => {
    expect(parseIpv6('::ffff:127.0.0.1')).toEqual([
      0, 0, 0, 0, 0, 0xffff, 0x7f00, 0x0001,
    ])
  })

  it('rejects malformed addresses', () => {
    expect(parseIpv6('1:2:3')).toBeNull()
    expect(parseIpv6('::1::2')).toBeNull()
    expect(parseIpv6('gggg::1')).toBeNull()
    expect(parseIpv6('192.168.0.1')).toBeNull()
  })
})

describe('isBlockedIp', () => {
  it('blocks loopback, private and link-local IPv4', () => {
    for (const ip of [
      '127.0.0.1',
      '127.1.2.3',
      '10.0.0.1',
      '172.16.0.1',
      '172.31.255.255',
      '192.168.1.1',
      '169.254.169.254',
      '0.0.0.0',
    ]) {
      expect(isBlockedIp(ip)).toBe(true)
    }
  })

  it('allows public IPv4', () => {
    for (const ip of ['8.8.8.8', '93.184.216.34', '1.1.1.1', '172.15.0.1', '172.32.0.1']) {
      expect(isBlockedIp(ip)).toBe(false)
    }
  })

  it('blocks loopback, link-local, ULA and mapped-v4 IPv6', () => {
    for (const ip of ['::1', '::', 'fe80::1', 'fc00::1', 'fd12:3456::1', '::ffff:127.0.0.1']) {
      expect(isBlockedIp(ip)).toBe(true)
    }
  })

  it('allows public IPv6', () => {
    expect(isBlockedIp('2001:4860:4860::8888')).toBe(false)
    expect(isBlockedIp('::ffff:8.8.8.8')).toBe(false)
  })
})

describe('isTruthyFlag', () => {
  it('recognises truthy spellings', () => {
    for (const v of ['1', 'true', 'TRUE', 'yes', 'On', ' true ']) {
      expect(isTruthyFlag(v)).toBe(true)
    }
  })

  it('treats everything else as false', () => {
    for (const v of [undefined, null, '', '0', 'false', 'no', 'off']) {
      expect(isTruthyFlag(v)).toBe(false)
    }
  })
})

describe('checkUrl — blocks private/local targets', () => {
  const neverResolver: HostResolver = async () => {
    throw new Error('resolver should not be called for IP literals')
  }

  it('blocks 127.0.0.1 (loopback literal)', async () => {
    expectBlocked(
      await checkUrl('http://127.0.0.1:3000/', { resolver: neverResolver }),
      'private-address',
    )
  })

  it('blocks localhost by name without resolving', async () => {
    expectBlocked(
      await checkUrl('http://localhost:3000/', { resolver: neverResolver }),
      'blocked-host',
    )
  })

  it('blocks the 10.0.0.0/8 private range', async () => {
    expectBlocked(await checkUrl('http://10.1.2.3/'), 'private-address')
  })

  it('blocks the 172.16.0.0/12 private range', async () => {
    expectBlocked(await checkUrl('http://172.16.5.5/'), 'private-address')
  })

  it('blocks the 192.168.0.0/16 private range', async () => {
    expectBlocked(await checkUrl('http://192.168.0.10/'), 'private-address')
  })

  it('blocks the 169.254.169.254 cloud-metadata endpoint', async () => {
    expectBlocked(await checkUrl('http://169.254.169.254/latest/meta-data/'), 'private-address')
  })

  it('blocks the IPv6 loopback ::1', async () => {
    expectBlocked(await checkUrl('http://[::1]:3000/'), 'private-address')
  })

  it('blocks a public-looking host that resolves to a private address (DNS rebinding)', async () => {
    expectBlocked(
      await checkUrl('http://rebind.example.com/', { resolver: fixedResolver('10.0.0.5') }),
      'private-address',
    )
  })
})

describe('checkUrl — allows public targets', () => {
  it('allows a public IP literal without resolving', async () => {
    const result = await checkUrl('https://8.8.8.8/', {
      resolver: async () => {
        throw new Error('should not resolve an IP literal')
      },
    })
    expect(result.allowed).toBe(true)
  })

  it('allows a hostname that resolves to a public address', async () => {
    const result = await checkUrl('https://example.com/', {
      resolver: fixedResolver('93.184.216.34'),
    })
    expect(result.allowed).toBe(true)
  })
})

describe('checkUrl — ALLOW_PRIVATE_NETWORK override', () => {
  it('allows a private literal when the option is set', async () => {
    const result = await checkUrl('http://127.0.0.1:3000/', {
      allowPrivateNetwork: true,
    })
    expect(result.allowed).toBe(true)
  })

  it('allows localhost when the option is set', async () => {
    const result = await checkUrl('http://localhost:8080/', {
      allowPrivateNetwork: true,
    })
    expect(result.allowed).toBe(true)
  })

  it('reads the bypass from ALLOW_PRIVATE_NETWORK when no option is passed', async () => {
    vi.stubEnv('ALLOW_PRIVATE_NETWORK', 'true')
    try {
      const result = await checkUrl('http://10.0.0.1/')
      expect(result.allowed).toBe(true)
    } finally {
      vi.unstubAllEnvs()
    }
  })

  it('still rejects an invalid URL under the bypass', async () => {
    expectBlocked(
      await checkUrl('not a url', { allowPrivateNetwork: true }),
      'invalid-url',
    )
  })
})

describe('checkUrl — malformed input and resolution failures', () => {
  it('rejects a non-parseable URL', async () => {
    expectBlocked(await checkUrl('not a url'), 'invalid-url')
  })

  it('rejects a non-http(s) protocol', async () => {
    expectBlocked(await checkUrl('ftp://example.com/'), 'invalid-url')
    expectBlocked(await checkUrl('file:///etc/passwd'), 'invalid-url')
  })

  it('blocks when DNS resolution throws', async () => {
    expectBlocked(
      await checkUrl('http://nx.example.com/', {
        resolver: async () => {
          throw new Error('ENOTFOUND')
        },
      }),
      'dns-failure',
    )
  })

  it('blocks when the host resolves to no addresses', async () => {
    expectBlocked(
      await checkUrl('http://empty.example.com/', { resolver: fixedResolver() }),
      'dns-failure',
    )
  })
})
