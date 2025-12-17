import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

type ContentTestHooks = {
  patternToRegex?: (pattern: string) => RegExp;
};

declare global {
  var __MBU_TEST_HOOKS__: ContentTestHooks | undefined;
}

function createChromeStub(): unknown {
  return {
    runtime: {
      lastError: null,
      onMessage: {
        addListener: vi.fn(),
      },
      sendMessage: vi.fn((_message: unknown, callback: (resp: unknown) => void) => callback({})),
    },
    storage: {
      sync: {
        get: vi.fn((_keys: string[], callback: (items: unknown) => void) => callback({})),
      },
      local: {
        get: vi.fn((_keys: string[], callback: (items: unknown) => void) => callback({})),
        set: vi.fn((_items: Record<string, unknown>, callback: () => void) => callback()),
      },
    },
  };
}

describe('patternToRegex (src/content.ts)', () => {
  let patternToRegex: (pattern: string) => RegExp;

  beforeAll(async () => {
    const hooks: ContentTestHooks = {};
    globalThis.__MBU_TEST_HOOKS__ = hooks;

    vi.stubGlobal('chrome', createChromeStub());

    await import('../src/content.ts');

    if (!hooks.patternToRegex) {
      throw new Error('patternToRegex was not exposed via __MBU_TEST_HOOKS__');
    }

    patternToRegex = hooks.patternToRegex;
  });

  afterAll(() => {
    vi.unstubAllGlobals();
    globalThis.__MBU_TEST_HOOKS__ = undefined;
  });

  it('allows optional trailing slash and query/hash suffix when safe', () => {
    const regex = patternToRegex('example.com/foo');

    expect(regex.test('example.com/foo')).toBe(true);
    expect(regex.test('example.com/foo/')).toBe(true);
    expect(regex.test('example.com/foo?x=1')).toBe(true);
    expect(regex.test('example.com/foo/#hash')).toBe(true);

    expect(regex.test('example.com/foo/bar')).toBe(false);
  });

  it('does not allow omitting an explicit trailing slash', () => {
    const regex = patternToRegex('example.com/foo/');

    expect(regex.test('example.com/foo/')).toBe(true);
    expect(regex.test('example.com/foo')).toBe(false);
    expect(regex.test('example.com/foo/?x=1')).toBe(true);
    expect(regex.test('example.com/foo//')).toBe(false);
  });

  it("does not add optional trailing slash when the pattern contains '*'", () => {
    const regex = patternToRegex('example.com/foo*bar');

    expect(regex.test('example.com/foo123bar')).toBe(true);
    expect(regex.test('example.com/foo123bar?x=1')).toBe(true);

    expect(regex.test('example.com/foo123bar/')).toBe(false);
    expect(regex.test('example.com/foo123bar/?x=1')).toBe(false);
  });

  it("disables optional query/hash suffix when pattern already includes '?' or '#'", () => {
    const queryRegex = patternToRegex('example.com/foo?bar');
    expect(queryRegex.test('example.com/foo?bar')).toBe(true);
    expect(queryRegex.test('example.com/foo?bar&x=1')).toBe(false);
    expect(queryRegex.test('example.com/foo?bar#hash')).toBe(false);

    const hashRegex = patternToRegex('example.com/foo#bar');
    expect(hashRegex.test('example.com/foo#bar')).toBe(true);
    expect(hashRegex.test('example.com/foo#bar?x=1')).toBe(false);
  });
});
