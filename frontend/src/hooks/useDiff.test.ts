import { renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useBodyDiff, useHeadersDiff } from './useDiff';

// ---------------------------------------------------------------------------
// useBodyDiff
// ---------------------------------------------------------------------------

describe('useBodyDiff', () => {
  it('produces all-unchanged hunks for identical bodies', () => {
    const body = 'line one\nline two\nline three';
    const { result } = renderHook(() => useBodyDiff(body, body));

    const { hunks, truncated } = result.current;
    expect(truncated).toBe(false);
    expect(hunks.every((h) => h.type === 'unchanged')).toBe(true);
    expect(hunks.length).toBeGreaterThan(0);
  });

  it('detects a single line addition', () => {
    // Use newline-terminated lines so diffLines produces a clean single-change diff
    const older = 'line one\nline two\n';
    const newer = 'line one\nline two\nline three\n';
    const { result } = renderHook(() => useBodyDiff(older, newer));

    const { hunks, truncated } = result.current;
    expect(truncated).toBe(false);

    const added = hunks.filter((h) => h.type === 'added');
    expect(added.length).toBe(1);
    expect(added[0].value).toBe('line three');
  });

  it('detects a single line deletion', () => {
    // Use newline-terminated lines so diffLines produces a clean single-change diff
    const older = 'line one\nline two\nline three\n';
    const newer = 'line one\nline three\n';
    const { result } = renderHook(() => useBodyDiff(older, newer));

    const { hunks, truncated } = result.current;
    expect(truncated).toBe(false);

    const removed = hunks.filter((h) => h.type === 'removed');
    expect(removed.length).toBe(1);
    expect(removed[0].value).toBe('line two');
  });

  it('sets truncated to true when older body exceeds 512 000 bytes', () => {
    // 512 001 ASCII bytes — one byte over the limit
    const bigBody = 'a'.repeat(512_001);
    const { result } = renderHook(() => useBodyDiff(bigBody, 'small'));

    expect(result.current.truncated).toBe(true);
  });

  it('sets truncated to true when newer body exceeds 512 000 bytes', () => {
    // 512 001 ASCII bytes — one byte over the limit
    const bigBody = 'a'.repeat(512_001);
    const { result } = renderHook(() => useBodyDiff('small', bigBody));

    expect(result.current.truncated).toBe(true);
  });

  it('does not truncate a body at the exact 512 000 byte boundary', () => {
    // Exactly 512 000 ASCII bytes — must NOT be truncated
    const exactBody = 'a'.repeat(512_000);
    const { result } = renderHook(() => useBodyDiff(exactBody, 'small'));

    expect(result.current.truncated).toBe(false);
  });

  it('truncates a body that is one byte over the 512 000 byte boundary', () => {
    // Exactly 512 001 ASCII bytes — must be truncated
    const overBody = 'a'.repeat(512_001);
    const { result } = renderHook(() => useBodyDiff(overBody, 'small'));

    expect(result.current.truncated).toBe(true);
  });

  it('returns hunks in source order with correct values', () => {
    const older = 'alpha\nbeta';
    const newer = 'alpha\nbeta\ngamma';
    const { result } = renderHook(() => useBodyDiff(older, newer));

    const { hunks } = result.current;
    // All unchanged lines appear before the added line, preserving source order.
    const values = hunks.map((h) => h.value);
    expect(values).toContain('alpha');
    expect(values).toContain('beta');
    expect(values).toContain('gamma');
    const gammaIdx = values.indexOf('gamma');
    expect(gammaIdx).toBeGreaterThan(values.indexOf('beta'));
  });

  it('returns truncated false for two small identical bodies', () => {
    const { result } = renderHook(() => useBodyDiff('', ''));
    expect(result.current.truncated).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// useHeadersDiff
// ---------------------------------------------------------------------------

describe('useHeadersDiff', () => {
  it('detects an added header', () => {
    const older = { 'content-type': ['application/json'] };
    const newer = {
      'content-type': ['application/json'],
      'x-new-header': ['value'],
    };
    const { result } = renderHook(() => useHeadersDiff(older, newer));

    const added = result.current.filter((r) => r.status === 'added');
    expect(added.length).toBe(1);
    expect(added[0].key).toBe('x-new-header');
    expect(added[0].oldValue).toBeNull();
    expect(added[0].newValue).toBe('value');
  });

  it('detects a removed header', () => {
    const older = {
      'content-type': ['application/json'],
      'x-old-header': ['gone'],
    };
    const newer = { 'content-type': ['application/json'] };
    const { result } = renderHook(() => useHeadersDiff(older, newer));

    const removed = result.current.filter((r) => r.status === 'removed');
    expect(removed.length).toBe(1);
    expect(removed[0].key).toBe('x-old-header');
    expect(removed[0].newValue).toBeNull();
    expect(removed[0].oldValue).toBe('gone');
  });

  it('detects a changed header value', () => {
    const older = { 'content-type': ['application/json'] };
    const newer = { 'content-type': ['text/plain'] };
    const { result } = renderHook(() => useHeadersDiff(older, newer));

    const changed = result.current.filter((r) => r.status === 'changed');
    expect(changed.length).toBe(1);
    expect(changed[0].key).toBe('content-type');
    expect(changed[0].oldValue).toBe('application/json');
    expect(changed[0].newValue).toBe('text/plain');
  });

  it('marks identical headers as unchanged', () => {
    const headers = { 'content-type': ['application/json'], accept: ['*/*'] };
    const { result } = renderHook(() => useHeadersDiff(headers, headers));

    expect(result.current.every((r) => r.status === 'unchanged')).toBe(true);
  });

  it('handles empty header maps without errors', () => {
    const { result } = renderHook(() => useHeadersDiff({}, {}));
    expect(result.current).toEqual([]);
  });

  it('returns correct rows for mixed added/removed/changed/unchanged', () => {
    const older = {
      keep: ['same'],
      change: ['old'],
      remove: ['bye'],
    };
    const newer = {
      keep: ['same'],
      change: ['new'],
      add: ['hello'],
    };
    const { result } = renderHook(() => useHeadersDiff(older, newer));
    const rows = result.current;

    const byKey = Object.fromEntries(rows.map((r) => [r.key, r]));
    expect(byKey['keep'].status).toBe('unchanged');
    expect(byKey['change'].status).toBe('changed');
    expect(byKey['remove'].status).toBe('removed');
    expect(byKey['add'].status).toBe('added');
  });
});
