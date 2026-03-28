import { useMemo } from 'react';
import { diffLines } from 'diff';

// ---------------------------------------------------------------------------
// Type definitions
// ---------------------------------------------------------------------------

export interface DiffHunk {
  type: 'added' | 'removed' | 'unchanged';
  value: string;
}

export interface HeaderDiffRow {
  key: string;
  oldValue: string | null;
  newValue: string | null;
  status: 'added' | 'removed' | 'changed' | 'unchanged';
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MAX_BODY_BYTES = 512_000; // 500 KB

// ---------------------------------------------------------------------------
// useBodyDiff
// ---------------------------------------------------------------------------

/**
 * Returns a structured line-level diff between two body strings.
 *
 * If either body exceeds 500 KB (512 000 bytes), it is sliced to 500 KB
 * before diffing and `truncated` is set to `true`.
 *
 * Slicing is performed on the UTF-8 byte representation so the threshold is
 * measured in bytes, not UTF-16 code units.
 */
export function useBodyDiff(
  older: string,
  newer: string
): { hunks: DiffHunk[]; truncated: boolean } {
  return useMemo(() => {
    let truncated = false;

    let safeOlder = older;
    let safeNewer = newer;

    const encoder = new TextEncoder();
    const decoder = new TextDecoder();

    const olderBytes = encoder.encode(older);
    if (olderBytes.length > MAX_BODY_BYTES) {
      safeOlder = decoder.decode(olderBytes.slice(0, MAX_BODY_BYTES));
      truncated = true;
    }
    const newerBytes = encoder.encode(newer);
    if (newerBytes.length > MAX_BODY_BYTES) {
      safeNewer = decoder.decode(newerBytes.slice(0, MAX_BODY_BYTES));
      truncated = true;
    }

    const changes = diffLines(safeOlder, safeNewer);
    const hunks: DiffHunk[] = [];

    for (const change of changes) {
      const type: DiffHunk['type'] = change.added
        ? 'added'
        : change.removed
          ? 'removed'
          : 'unchanged';

      // Split on newline but keep empty-string entries that represent blank
      // lines.  A trailing newline produces an empty string at the end — skip
      // it to avoid phantom entries.
      const lines = change.value.split('\n');
      if (lines[lines.length - 1] === '') {
        lines.pop();
      }

      for (const line of lines) {
        hunks.push({ type, value: line });
      }
    }

    return { hunks, truncated };
  }, [older, newer]);
}

// ---------------------------------------------------------------------------
// useHeadersDiff
// ---------------------------------------------------------------------------

/**
 * Compares two header maps and returns a row per unique key describing how
 * each header changed (added, removed, changed, or unchanged).
 */
export function useHeadersDiff(
  older: Record<string, string[]>,
  newer: Record<string, string[]>
): HeaderDiffRow[] {
  return useMemo(() => {
    const allKeys = new Set([...Object.keys(older), ...Object.keys(newer)]);
    const rows: HeaderDiffRow[] = [];

    for (const key of allKeys) {
      const inOlder = Object.prototype.hasOwnProperty.call(older, key);
      const inNewer = Object.prototype.hasOwnProperty.call(newer, key);

      if (inOlder && inNewer) {
        const oldValue = JSON.stringify(older[key]);
        const newValue = JSON.stringify(newer[key]);
        rows.push({
          key,
          oldValue: older[key].join(', '),
          newValue: newer[key].join(', '),
          status: oldValue !== newValue ? 'changed' : 'unchanged',
        });
      } else if (inOlder) {
        rows.push({
          key,
          oldValue: older[key].join(', '),
          newValue: null,
          status: 'removed',
        });
      } else {
        rows.push({
          key,
          oldValue: null,
          newValue: newer[key].join(', '),
          status: 'added',
        });
      }
    }

    return rows;
    // Serialize to primitive strings so useMemo re-runs only when content
    // changes, not on every render due to new object references.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(older), JSON.stringify(newer)]);
}
