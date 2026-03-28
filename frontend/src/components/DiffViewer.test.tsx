import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import DiffViewer from './DiffViewer';
import { HistoryEntry } from '../store/historyStore';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeEntry(overrides: Partial<HistoryEntry> = {}): HistoryEntry {
  return {
    id: 1,
    method: 'GET',
    url: 'https://example.com/api',
    headers: '[]',
    params: '[]',
    body_type: 'none',
    body: '',
    response_status: 200,
    response_body: '{"ok":true}',
    response_headers: JSON.stringify({ 'content-type': ['application/json'] }),
    response_duration_ms: 120,
    response_size_bytes: 11,
    executed_at: '2024-01-01T12:00:00Z',
    ...overrides,
  };
}

const olderEntry = makeEntry({
  id: 1,
  response_status: 200,
  response_body: 'line1\nline2\n',
  response_duration_ms: 100,
  response_size_bytes: 12,
  executed_at: '2024-01-01T10:00:00Z',
});

const newerEntry = makeEntry({
  id: 2,
  response_status: 404,
  response_body: 'line1\nline3\n',
  response_duration_ms: 250,
  response_size_bytes: 20,
  executed_at: '2024-01-01T11:00:00Z',
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('DiffViewer', () => {
  let onClose: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    onClose = vi.fn();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders the modal with three tabs', () => {
    render(<DiffViewer older={olderEntry} newer={newerEntry} onClose={onClose} />);

    expect(screen.getByRole('tab', { name: 'Body Diff' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Headers Diff' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Meta' })).toBeInTheDocument();
  });

  it('defaults to the Body Diff tab', () => {
    render(<DiffViewer older={olderEntry} newer={newerEntry} onClose={onClose} />);

    const bodyTab = screen.getByRole('tab', { name: 'Body Diff' });
    expect(bodyTab).toHaveAttribute('aria-selected', 'true');
  });

  it('switches tabs when clicked', () => {
    render(<DiffViewer older={olderEntry} newer={newerEntry} onClose={onClose} />);

    fireEvent.click(screen.getByRole('tab', { name: 'Headers Diff' }));
    expect(screen.getByRole('tab', { name: 'Headers Diff' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: 'Body Diff' })).toHaveAttribute('aria-selected', 'false');
  });

  it('calls onClose when the close button is clicked', () => {
    render(<DiffViewer older={olderEntry} newer={newerEntry} onClose={onClose} />);

    fireEvent.click(screen.getByRole('button', { name: 'Close diff viewer' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('calls onClose when the Escape key is pressed', () => {
    render(<DiffViewer older={olderEntry} newer={newerEntry} onClose={onClose} />);

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('calls onClose when the backdrop is clicked', () => {
    const { container } = render(<DiffViewer older={olderEntry} newer={newerEntry} onClose={onClose} />);

    const backdrop = container.querySelector('.diff-viewer-backdrop');
    expect(backdrop).toBeInTheDocument();
    fireEvent.click(backdrop!);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('does NOT call onClose when clicking inside the modal box', () => {
    render(<DiffViewer older={olderEntry} newer={newerEntry} onClose={onClose} />);

    fireEvent.click(screen.getByRole('dialog'));
    expect(onClose).not.toHaveBeenCalled();
  });

  it('shows Split and Unified toggle buttons on Body Diff tab', () => {
    render(<DiffViewer older={olderEntry} newer={newerEntry} onClose={onClose} />);

    expect(screen.getByRole('button', { name: 'Split' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Unified' })).toBeInTheDocument();
  });

  it('defaults to split view mode', () => {
    render(<DiffViewer older={olderEntry} newer={newerEntry} onClose={onClose} />);

    const splitBtn = screen.getByRole('button', { name: 'Split' });
    expect(splitBtn).toHaveAttribute('aria-pressed', 'true');
  });

  it('switches to unified view when the Unified button is clicked', () => {
    render(<DiffViewer older={olderEntry} newer={newerEntry} onClose={onClose} />);

    fireEvent.click(screen.getByRole('button', { name: 'Unified' }));
    expect(screen.getByRole('button', { name: 'Unified' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Split' })).toHaveAttribute('aria-pressed', 'false');
  });

  it('renders Meta tab with status, duration and size rows', () => {
    render(<DiffViewer older={olderEntry} newer={newerEntry} onClose={onClose} />);

    fireEvent.click(screen.getByRole('tab', { name: 'Meta' }));

    expect(screen.getByText('Status Code')).toBeInTheDocument();
    expect(screen.getByText('Duration (ms)')).toBeInTheDocument();
    expect(screen.getByText('Response Size (bytes)')).toBeInTheDocument();
  });

  it('renders Headers Diff tab with HeadersDiffTable', () => {
    render(<DiffViewer older={olderEntry} newer={newerEntry} onClose={onClose} />);

    fireEvent.click(screen.getByRole('tab', { name: 'Headers Diff' }));

    // HeadersDiffTable renders a table with a "Header" column header
    expect(screen.getByText('Header')).toBeInTheDocument();
  });

  it('does not show truncation warning when bodies are within limit', () => {
    render(<DiffViewer older={olderEntry} newer={newerEntry} onClose={onClose} />);

    expect(
      screen.queryByText(/truncated to 500 KB/i)
    ).not.toBeInTheDocument();
  });

  it('removes the Escape listener when unmounted', () => {
    const removeEventListenerSpy = vi.spyOn(document, 'removeEventListener');
    const { unmount } = render(<DiffViewer older={olderEntry} newer={newerEntry} onClose={onClose} />);

    unmount();

    expect(removeEventListenerSpy).toHaveBeenCalledWith('keydown', expect.any(Function));
  });

  it('gracefully handles malformed response_headers JSON', () => {
    const brokenEntry = makeEntry({ response_headers: '{not json}' });
    // Should render without throwing
    expect(() =>
      render(<DiffViewer older={brokenEntry} newer={newerEntry} onClose={onClose} />)
    ).not.toThrow();

    fireEvent.click(screen.getByRole('tab', { name: 'Headers Diff' }));
    expect(screen.getByText('Header')).toBeInTheDocument();
  });
});
