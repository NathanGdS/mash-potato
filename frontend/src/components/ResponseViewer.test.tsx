import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import ResponseViewer from './ResponseViewer';
import { useResponseStore } from '../store/responseStore';
import { db } from '../../wailsjs/go/models';

// ---------------------------------------------------------------------------
// Mock heavy child components so tests stay focused on ResponseViewer logic
// ---------------------------------------------------------------------------

vi.mock('./StatusBadge', () => ({
  default: ({ statusCode }: { statusCode: number }) => (
    <span data-testid="status-badge">{statusCode}</span>
  ),
}));

vi.mock('./MetricsBar', () => ({
  default: () => <span data-testid="metrics-bar" />,
}));

vi.mock('./ResponseBody', () => ({
  default: ({ body }: { body: string }) => <div data-testid="response-body">{body}</div>,
}));

vi.mock('./ResponseHeaders', () => ({
  default: () => <div data-testid="response-headers" />,
}));

vi.mock('./TestResults', () => ({
  default: () => <div data-testid="test-results" />,
}));

vi.mock('./ConsolePanel', () => ({
  default: () => <div data-testid="console-panel" />,
}));

vi.mock('./TimingWaterfall', () => ({
  default: ({ timing }: { timing: db.TimingPhases }) => (
    <div data-testid="timing-waterfall" data-dns={timing.dns_lookup} />
  ),
}));

vi.mock('../utils/jsonHighlighter', () => ({
  tryPrettyPrint: (body: string) => ({ text: body, isJson: false }),
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeResponse(overrides: Record<string, unknown> = {}) {
  return {
    StatusCode: 200,
    StatusText: 'OK',
    Body: '{"ok":true}',
    Headers: { 'content-type': 'application/json' },
    DurationMs: 120,
    SizeBytes: 42,
    TestResults: [],
    Timing: undefined,
    ...overrides,
  };
}

function setStoreState(overrides: Parameters<typeof useResponseStore.setState>[0]) {
  useResponseStore.setState({
    responses: {},
    activeRequestId: null,
    isLoading: false,
    error: null,
    timing: undefined,
    ...overrides,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  setStoreState({});
});

// ---------------------------------------------------------------------------
// ResponseViewer — timing placeholder
// ---------------------------------------------------------------------------

describe('ResponseViewer timing tab', () => {
  it('renders "Send a request to see timing data" placeholder when timing is undefined', () => {
    const response = makeResponse({ Timing: undefined });
    setStoreState({
      responses: { 'req-1': response as any },
      activeRequestId: 'req-1',
    });

    render(<ResponseViewer />);

    // Switch to timing tab
    fireEvent.click(screen.getByRole('button', { name: /timing/i }));

    expect(
      screen.getByText('Send a request to see timing data.'),
    ).toBeInTheDocument();
  });

  it('renders TimingWaterfall when timing is defined', () => {
    const timing = db.TimingPhases.createFrom({
      dns_lookup: 10,
      tcp_handshake: 20,
      tls_handshake: 0,
      ttfb: 80,
      download: 40,
    });
    const response = makeResponse({ Timing: timing });
    setStoreState({
      responses: { 'req-1': response as any },
      activeRequestId: 'req-1',
    });

    render(<ResponseViewer />);
    fireEvent.click(screen.getByRole('button', { name: /timing/i }));

    expect(screen.getByTestId('timing-waterfall')).toBeInTheDocument();
    expect(
      screen.queryByText('Send a request to see timing data.'),
    ).not.toBeInTheDocument();
  });

  it('renders placeholder text when no response exists (empty state)', () => {
    setStoreState({ responses: {}, activeRequestId: null });

    render(<ResponseViewer />);

    expect(screen.getByText('Hit Send to see the response.')).toBeInTheDocument();
  });
});
