import React from 'react';
import { DiffHunk } from '../hooks/useDiff';
import './DiffPane.css';

interface DiffPaneProps {
  hunks: DiffHunk[];
  view: 'split' | 'unified';
  /** Only relevant in split view: which side of the diff this panel represents. */
  side?: 'left' | 'right';
}

/**
 * DiffPane renders a single scrollable panel of diff lines.
 *
 * - Split view: shows one gutter column tracking either the old (left)
 *   or new (right) line numbers.
 * - Unified view: shows two gutter columns — old line number | new line number.
 *
 * The component is intentionally data-only: it accepts DiffHunk[] directly
 * and has no dependency on any store or feature component.
 */
const DiffPane: React.FC<DiffPaneProps> = ({ hunks, view, side = 'left' }) => {
  // Build display rows with resolved line numbers once so the render loop is
  // straightforward.
  const rows = buildRows(hunks, view, side);

  return (
    <div className="diff-pane">
      <pre className="diff-pane__pre" aria-label="diff content">
        {rows.map((row, idx) => (
          <DiffLine
            key={`${row.type}-${row.oldNum ?? row.lineNum ?? ''}-${row.newNum ?? ''}-${idx}`}
            row={row}
            view={view}
          />
        ))}
      </pre>
    </div>
  );
};

// ── Internal types ────────────────────────────────────────

interface DisplayRow {
  type: 'added' | 'removed' | 'unchanged';
  /** Line number for the split-view gutter (single column). */
  lineNum: number | null;
  /** Old-side line number for unified-view gutter. */
  oldNum: number | null;
  /** New-side line number for unified-view gutter. */
  newNum: number | null;
  content: string;
}

// ── Row builder ───────────────────────────────────────────

function buildRows(
  hunks: DiffHunk[],
  view: 'split' | 'unified',
  side: 'left' | 'right',
): DisplayRow[] {
  let oldLine = 1;
  let newLine = 1;

  return hunks.map((hunk): DisplayRow => {
    if (view === 'unified') {
      const oldNum = hunk.type !== 'added'   ? oldLine : null;
      const newNum = hunk.type !== 'removed' ? newLine : null;

      if (hunk.type !== 'added')   oldLine++;
      if (hunk.type !== 'removed') newLine++;

      return {
        type: hunk.type,
        lineNum: null,
        oldNum,
        newNum,
        content: hunk.value,
      };
    }

    // split view
    if (side === 'left') {
      // Left panel tracks the old/original side (deletions + unchanged).
      const lineNum = hunk.type !== 'added' ? oldLine : null;
      if (hunk.type !== 'added') oldLine++;

      return { type: hunk.type, lineNum, oldNum: null, newNum: null, content: hunk.value };
    } else {
      // Right panel tracks the new/current side (additions + unchanged).
      const lineNum = hunk.type !== 'removed' ? newLine : null;
      if (hunk.type !== 'removed') newLine++;

      return { type: hunk.type, lineNum, oldNum: null, newNum: null, content: hunk.value };
    }
  });
}

// ── DiffLine sub-component ────────────────────────────────

interface DiffLineProps {
  row: DisplayRow;
  view: 'split' | 'unified';
}

const PREFIX: Record<DisplayRow['type'], string> = {
  added: '+',
  removed: '-',
  unchanged: ' ',
};

const LINE_CLASS: Record<DisplayRow['type'], string> = {
  added: 'diff-line diff-line--added',
  removed: 'diff-line diff-line--removed',
  unchanged: 'diff-line diff-line--unchanged',
};

const DiffLine: React.FC<DiffLineProps> = ({ row, view }) => {
  const formatNum = (n: number | null): string =>
    n == null ? '   ' : String(n).padStart(3, ' ');

  const gutter =
    view === 'unified' ? (
      <span className="diff-gutter">
        <span className="diff-gutter__num">{formatNum(row.oldNum)}</span>
        <span className="diff-gutter__sep">│</span>
        <span className="diff-gutter__num">{formatNum(row.newNum)}</span>
      </span>
    ) : (
      <span className="diff-gutter">
        <span className="diff-gutter__num">{formatNum(row.lineNum)}</span>
      </span>
    );

  return (
    <span className={LINE_CLASS[row.type]}>
      {gutter}
      <span className="diff-line__prefix">{PREFIX[row.type]}</span>
      <span className="diff-line__content">{row.content}</span>
    </span>
  );
};

export default DiffPane;
