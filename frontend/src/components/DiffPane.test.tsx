import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import DiffPane from './DiffPane';
import type { DiffHunk } from '../hooks/useDiff';

// Mock the CSS import so Vitest does not try to process it
vi.mock('./DiffPane.css', () => ({}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeHunks(...specs: Array<[DiffHunk['type'], string]>): DiffHunk[] {
  return specs.map(([type, value], i) => ({ type, value, lineNumber: i + 1 }));
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

describe('DiffPane', () => {
  it('renders the diff container with role-compatible pre element', () => {
    const hunks = makeHunks(['unchanged', 'hello']);
    const { container } = render(<DiffPane hunks={hunks} view="unified" />);
    const pre = container.querySelector('pre.diff-pane__pre');
    expect(pre).not.toBeNull();
  });

  it('renders one row per hunk', () => {
    const hunks = makeHunks(
      ['unchanged', 'alpha'],
      ['added', 'beta'],
      ['removed', 'gamma'],
    );
    const { container } = render(<DiffPane hunks={hunks} view="unified" />);
    // Each row is a <span> with class diff-line
    const rows = container.querySelectorAll('.diff-line');
    expect(rows.length).toBe(3);
  });

  // ── CSS class application ─────────────────────────────────────────────────

  it('applies diff-line--added class for added hunks', () => {
    const hunks = makeHunks(['added', 'new line']);
    const { container } = render(<DiffPane hunks={hunks} view="unified" />);
    expect(container.querySelector('.diff-line--added')).not.toBeNull();
  });

  it('applies diff-line--removed class for removed hunks', () => {
    const hunks = makeHunks(['removed', 'old line']);
    const { container } = render(<DiffPane hunks={hunks} view="unified" />);
    expect(container.querySelector('.diff-line--removed')).not.toBeNull();
  });

  it('applies diff-line--unchanged class for unchanged hunks', () => {
    const hunks = makeHunks(['unchanged', 'same']);
    const { container } = render(<DiffPane hunks={hunks} view="unified" />);
    expect(container.querySelector('.diff-line--unchanged')).not.toBeNull();
  });

  // ── Prefix characters ────────────────────────────────────────────────────

  it('uses "+" prefix for added lines', () => {
    const hunks = makeHunks(['added', 'new content']);
    render(<DiffPane hunks={hunks} view="unified" />);
    const prefixes = screen.getAllByText('+');
    expect(prefixes.length).toBeGreaterThan(0);
  });

  it('uses "-" prefix for removed lines', () => {
    const hunks = makeHunks(['removed', 'old content']);
    render(<DiffPane hunks={hunks} view="unified" />);
    const prefixes = screen.getAllByText('-');
    expect(prefixes.length).toBeGreaterThan(0);
  });

  it('uses " " prefix for unchanged lines', () => {
    const hunks = makeHunks(['unchanged', 'static']);
    const { container } = render(<DiffPane hunks={hunks} view="unified" />);
    const prefix = container.querySelector('.diff-line__prefix');
    expect(prefix?.textContent).toBe(' ');
  });

  // ── Line content ─────────────────────────────────────────────────────────

  it('renders hunk value as line content', () => {
    const hunks = makeHunks(['unchanged', 'the content text']);
    render(<DiffPane hunks={hunks} view="unified" />);
    expect(screen.getByText('the content text')).toBeInTheDocument();
  });

  // ── Unified gutter (two-column) ──────────────────────────────────────────

  it('renders two gutter number spans per line in unified view', () => {
    const hunks = makeHunks(['unchanged', 'line']);
    const { container } = render(<DiffPane hunks={hunks} view="unified" />);
    const nums = container.querySelectorAll('.diff-gutter__num');
    // 1 hunk × 2 gutter columns
    expect(nums.length).toBe(2);
  });

  it('renders gutter separator in unified view', () => {
    const hunks = makeHunks(['unchanged', 'line']);
    const { container } = render(<DiffPane hunks={hunks} view="unified" />);
    expect(container.querySelector('.diff-gutter__sep')).not.toBeNull();
  });

  // ── Split gutter (single-column) ─────────────────────────────────────────

  it('renders one gutter number span per line in split view', () => {
    const hunks = makeHunks(['unchanged', 'line']);
    const { container } = render(<DiffPane hunks={hunks} view="split" side="left" />);
    const nums = container.querySelectorAll('.diff-gutter__num');
    // 1 hunk × 1 gutter column
    expect(nums.length).toBe(1);
  });

  it('does not render gutter separator in split view', () => {
    const hunks = makeHunks(['unchanged', 'line']);
    const { container } = render(<DiffPane hunks={hunks} view="split" side="left" />);
    expect(container.querySelector('.diff-gutter__sep')).toBeNull();
  });

  // ── Split view side logic ─────────────────────────────────────────────────

  it('left panel: added line shows empty gutter (no old-side number)', () => {
    const hunks = makeHunks(['added', 'new']);
    const { container } = render(<DiffPane hunks={hunks} view="split" side="left" />);
    const num = container.querySelector('.diff-gutter__num');
    // lineNum is null for added hunks on the left — rendered as spaces
    expect(num?.textContent?.trim()).toBe('');
  });

  it('right panel: removed line shows empty gutter (no new-side number)', () => {
    const hunks = makeHunks(['removed', 'gone']);
    const { container } = render(<DiffPane hunks={hunks} view="split" side="right" />);
    const num = container.querySelector('.diff-gutter__num');
    expect(num?.textContent?.trim()).toBe('');
  });

  it('right panel: added line shows a gutter number', () => {
    // First hunk is unchanged so new-side counter starts at 1, second is added → 2
    const hunks = makeHunks(['unchanged', 'base'], ['added', 'extra']);
    const { container } = render(<DiffPane hunks={hunks} view="split" side="right" />);
    const nums = container.querySelectorAll('.diff-gutter__num');
    // Row 0 (unchanged): "  1", Row 1 (added): "  2"
    expect(nums[1].textContent?.trim()).toBe('2');
  });

  // ── Unified view line number increments ──────────────────────────────────

  it('unified: old number blank for added lines', () => {
    const hunks = makeHunks(['added', 'fresh']);
    const { container } = render(<DiffPane hunks={hunks} view="unified" />);
    const nums = container.querySelectorAll('.diff-gutter__num');
    // oldNum is null for added lines
    expect(nums[0].textContent?.trim()).toBe('');
    // newNum should be 1
    expect(nums[1].textContent?.trim()).toBe('1');
  });

  it('unified: new number blank for removed lines', () => {
    const hunks = makeHunks(['removed', 'gone']);
    const { container } = render(<DiffPane hunks={hunks} view="unified" />);
    const nums = container.querySelectorAll('.diff-gutter__num');
    // oldNum should be 1
    expect(nums[0].textContent?.trim()).toBe('1');
    // newNum is null for removed lines
    expect(nums[1].textContent?.trim()).toBe('');
  });

  // ── Empty hunks ──────────────────────────────────────────────────────────

  it('renders nothing when hunks array is empty', () => {
    const { container } = render(<DiffPane hunks={[]} view="unified" />);
    expect(container.querySelectorAll('.diff-line').length).toBe(0);
  });

  // ── No store/feature dependencies ────────────────────────────────────────

  it('renders without any store context or providers', () => {
    // If DiffPane had store dependencies this would throw; the test passing
    // is itself the assertion.
    expect(() =>
      render(<DiffPane hunks={makeHunks(['unchanged', 'x'])} view="unified" />),
    ).not.toThrow();
  });
});
