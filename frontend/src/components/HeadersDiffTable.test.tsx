import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi } from 'vitest';
import { HeadersDiffTable } from './HeadersDiffTable';

// Mock CSS imports so Vitest does not try to process them
vi.mock('./HeadersDiffTable.css', () => ({}));

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const EMPTY: Record<string, string[]> = {};

const BASE: Record<string, string[]> = {
  'content-type': ['application/json'],
  'x-request-id': ['abc-123'],
};

// ---------------------------------------------------------------------------
// Rendering — basic structure
// ---------------------------------------------------------------------------

describe('HeadersDiffTable', () => {
  it('renders a table with three column headers', () => {
    render(<HeadersDiffTable older={BASE} newer={BASE} />);
    expect(screen.getByText('Header')).toBeInTheDocument();
    expect(screen.getByText('Old value')).toBeInTheDocument();
    expect(screen.getByText('New value')).toBeInTheDocument();
  });

  it('renders without any store context or providers', () => {
    expect(() =>
      render(<HeadersDiffTable older={BASE} newer={BASE} />),
    ).not.toThrow();
  });

  // ── Row categorisation ──────────────────────────────────────────────────

  it('shows added row when a header is only in newer', () => {
    const older = {};
    const newer = { 'x-new': ['value'] };
    const { container } = render(
      <HeadersDiffTable older={older} newer={newer} />,
    );
    const row = container.querySelector('.headers-diff-row--added');
    expect(row).not.toBeNull();
    expect(row?.textContent).toContain('x-new');
  });

  it('shows removed row when a header is only in older', () => {
    const older = { 'x-gone': ['old'] };
    const newer = {};
    const { container } = render(
      <HeadersDiffTable older={older} newer={newer} />,
    );
    const row = container.querySelector('.headers-diff-row--removed');
    expect(row).not.toBeNull();
    expect(row?.textContent).toContain('x-gone');
  });

  it('shows changed row when a header value differs', () => {
    const older = { 'content-type': ['text/plain'] };
    const newer = { 'content-type': ['application/json'] };
    const { container } = render(
      <HeadersDiffTable older={older} newer={newer} />,
    );
    const row = container.querySelector('.headers-diff-row--changed');
    expect(row).not.toBeNull();
  });

  it('does NOT show unchanged rows by default', () => {
    const { container } = render(
      <HeadersDiffTable older={BASE} newer={BASE} />,
    );
    const rows = container.querySelectorAll('.headers-diff-row--unchanged');
    expect(rows.length).toBe(0);
  });

  // ── Toggle unchanged ────────────────────────────────────────────────────

  it('toggle button shows count of unchanged rows', () => {
    render(<HeadersDiffTable older={BASE} newer={BASE} />);
    expect(screen.getByText(/Show unchanged \(2\)/)).toBeInTheDocument();
  });

  it('clicking toggle reveals unchanged rows', async () => {
    const user = userEvent.setup();
    const { container } = render(
      <HeadersDiffTable older={BASE} newer={BASE} />,
    );
    await user.click(screen.getByText(/Show unchanged/));
    const rows = container.querySelectorAll('.headers-diff-row--unchanged');
    expect(rows.length).toBe(2);
  });

  it('clicking toggle a second time hides unchanged rows again', async () => {
    const user = userEvent.setup();
    const { container } = render(
      <HeadersDiffTable older={BASE} newer={BASE} />,
    );
    await user.click(screen.getByText(/Show unchanged/));
    await user.click(screen.getByText(/Hide unchanged/));
    const rows = container.querySelectorAll('.headers-diff-row--unchanged');
    expect(rows.length).toBe(0);
  });

  it('toggle button label switches between Show and Hide', async () => {
    const user = userEvent.setup();
    render(<HeadersDiffTable older={BASE} newer={BASE} />);
    const btn = screen.getByText(/Show unchanged/);
    await user.click(btn);
    expect(screen.getByText(/Hide unchanged \(2\)/)).toBeInTheDocument();
  });

  it('does not render toggle button when there are no unchanged rows', () => {
    const older = { 'x-a': ['1'] };
    const newer = { 'x-b': ['2'] };
    render(<HeadersDiffTable older={older} newer={newer} />);
    expect(screen.queryByText(/unchanged/i)).toBeNull();
  });

  // ── Value columns ───────────────────────────────────────────────────────

  it('added row: old-value cell is empty', () => {
    const older = {};
    const newer = { 'x-new': ['hello'] };
    const { container } = render(
      <HeadersDiffTable older={older} newer={newer} />,
    );
    const cells = container.querySelectorAll(
      '.headers-diff-row--added td.cell-value',
    );
    // cells[0] = old value, cells[1] = new value
    expect(cells[0].textContent).toBe('');
    expect(cells[1].textContent).toBe('hello');
  });

  it('removed row: new-value cell is empty', () => {
    const older = { 'x-gone': ['bye'] };
    const newer = {};
    const { container } = render(
      <HeadersDiffTable older={older} newer={newer} />,
    );
    const cells = container.querySelectorAll(
      '.headers-diff-row--removed td.cell-value',
    );
    expect(cells[0].textContent).toBe('bye');
    expect(cells[1].textContent).toBe('');
  });

  // ── Empty inputs ────────────────────────────────────────────────────────

  it('renders an empty table body when both maps are empty', () => {
    const { container } = render(
      <HeadersDiffTable older={EMPTY} newer={EMPTY} />,
    );
    const rows = container.querySelectorAll('tbody tr');
    expect(rows.length).toBe(0);
  });
});
