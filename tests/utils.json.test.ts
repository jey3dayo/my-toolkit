import { Result } from '@praha/byethrow';
import { describe, expect, it } from 'vitest';

import { safeParseJsonObject } from '../src/utils/json';

describe('safeParseJsonObject', () => {
  it('parses JSON object', () => {
    const result = safeParseJsonObject<{ a: number }>('{"a":1}');
    expect(Result.isSuccess(result)).toBe(true);
    if (Result.isSuccess(result)) {
      expect(result.value).toEqual({ a: 1 });
    }
  });

  it('parses JSON object with surrounding text', () => {
    const result = safeParseJsonObject<{ ok: boolean }>('prefix {"ok":true} suffix');
    expect(Result.isSuccess(result)).toBe(true);
    if (Result.isSuccess(result)) {
      expect(result.value).toEqual({ ok: true });
    }
  });

  it('fails when JSON object is not found', () => {
    const result = safeParseJsonObject('not a json');
    expect(Result.isFailure(result)).toBe(true);
  });
});

