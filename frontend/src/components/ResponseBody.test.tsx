import { render, screen, fireEvent, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest';
import ResponseBody from './ResponseBody';
import { useEnvironmentsStore } from '../store/environmentsStore';

vi.mock('../wailsjs/go/main/App', () => ({
  SetVariable: vi.fn(),
  GetVariables: vi.fn(),
  ListEnvironments: vi.fn(),
  CreateEnvironment: vi.fn(),
  RenameEnvironment: vi.fn(),
  DeleteEnvironment: vi.fn(),
  DeleteVariable: vi.fn(),
  GetActiveEnvironment: vi.fn(),
  SetActiveEnvironment: vi.fn(),
}));

import * as App from '../wailsjs/go/main/App';

function resetStore(overrides: Partial<Parameters<typeof useEnvironmentsStore.setState>[0]> = {}) {
  useEnvironmentsStore.setState({
    environments: [],
    loading: false,
    error: null,
    activeEnvironmentId: '',
    variables: {},
    ...overrides,
  });
}

/** Mocks window.getSelection so a mouseup on `container` triggers selectionAnchor. */
function mockSelectionInside(container: HTMLElement, text: string) {
  const fakeRange = {
    commonAncestorContainer: container,
    getBoundingClientRect: () => ({ left: 100, top: 200, width: 60, height: 20 }),
  };
  vi.spyOn(window, 'getSelection').mockReturnValue({
    isCollapsed: false,
    rangeCount: 1,
    toString: () => text,
    getRangeAt: () => fakeRange,
  } as unknown as Selection);
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.restoreAllMocks();
  resetStore();
});

// US-12: View Response Body — pretty-print, raw, and JSON detection

describe('ResponseBody', () => {
  it('renders Pretty and Raw tabs', () => {
    render(<ResponseBody body="" />);
    expect(screen.getByRole('button', { name: /pretty/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /raw/i })).toBeInTheDocument();
  });

  it('starts in pretty mode (Pretty tab is active)', () => {
    render(<ResponseBody body="{}" />);
    const prettyBtn = screen.getByRole('button', { name: /pretty/i });
    expect(prettyBtn).toHaveClass('rb-tab--active');
  });

  it('pretty-prints valid JSON body', () => {
    render(<ResponseBody body='{"name":"alice","age":30}' />);
    // Pretty-printed JSON should have newlines/indentation
    expect(document.querySelector('pre')?.textContent).toContain('"name": "alice"');
  });

  it('shows raw body as-is in pretty mode when not JSON', () => {
    render(<ResponseBody body="plain text response" />);
    expect(document.querySelector('pre')?.textContent).toBe('plain text response');
  });

  it('shows "not JSON" hint for non-JSON content in pretty mode', () => {
    render(<ResponseBody body="plain text" />);
    expect(screen.getByText(/not json/i)).toBeInTheDocument();
  });

  it('does not show "not JSON" hint for valid JSON', () => {
    render(<ResponseBody body='{"ok":true}' />);
    expect(screen.queryByText(/not json/i)).not.toBeInTheDocument();
  });

  it('shows raw body when Raw tab is clicked', async () => {
    const user = userEvent.setup();
    render(<ResponseBody body='{"key":"value"}' />);
    await user.click(screen.getByRole('button', { name: /raw/i }));
    expect(document.querySelector('pre')?.textContent).toBe('{"key":"value"}');
  });

  it('Raw tab becomes active after click', async () => {
    const user = userEvent.setup();
    render(<ResponseBody body='{"x":1}' />);
    await user.click(screen.getByRole('button', { name: /raw/i }));
    expect(screen.getByRole('button', { name: /raw/i })).toHaveClass('rb-tab--active');
    expect(screen.getByRole('button', { name: /pretty/i })).not.toHaveClass('rb-tab--active');
  });

  it('can switch back from raw to pretty', async () => {
    const user = userEvent.setup();
    render(<ResponseBody body='{"x":1}' />);
    await user.click(screen.getByRole('button', { name: /raw/i }));
    await user.click(screen.getByRole('button', { name: /pretty/i }));
    expect(screen.getByRole('button', { name: /pretty/i })).toHaveClass('rb-tab--active');
  });

  it('does not show "not JSON" hint for empty body', () => {
    render(<ResponseBody body="" />);
    expect(screen.queryByText(/not json/i)).not.toBeInTheDocument();
  });
});

// US-1 (0003): Select Value From Response

describe('ResponseBody — selection floating button', () => {
  it('does not show save button when nothing is selected', () => {
    render(<ResponseBody body="some text" />);
    expect(screen.queryByRole('button', { name: /save as variable/i })).not.toBeInTheDocument();
  });

  it('shows save button after selecting text inside the pre element', () => {
    render(<ResponseBody body="some text" />);
    const pre = document.querySelector('pre')!;
    mockSelectionInside(pre, 'some text');
    fireEvent.mouseUp(pre);
    expect(screen.getByRole('button', { name: /save as variable/i })).toBeInTheDocument();
  });

  it('save button is disabled and shows tooltip when no active environment', () => {
    resetStore({ activeEnvironmentId: '' });
    render(<ResponseBody body="some text" />);
    const pre = document.querySelector('pre')!;
    mockSelectionInside(pre, 'some text');
    fireEvent.mouseUp(pre);
    expect(screen.getByRole('button', { name: /save as variable/i })).toBeDisabled();
    expect(screen.getByText(/select an environment first/i)).toBeInTheDocument();
  });

  it('save button is enabled when an active environment is set', () => {
    resetStore({ activeEnvironmentId: 'env-1' });
    render(<ResponseBody body="some text" />);
    const pre = document.querySelector('pre')!;
    mockSelectionInside(pre, 'some text');
    fireEvent.mouseUp(pre);
    expect(screen.getByRole('button', { name: /save as variable/i })).not.toBeDisabled();
  });

  it('hides the save button after mousedown (new drag starts)', () => {
    resetStore({ activeEnvironmentId: 'env-1' });
    render(<ResponseBody body="some text" />);
    const pre = document.querySelector('pre')!;
    mockSelectionInside(pre, 'some text');
    fireEvent.mouseUp(pre);
    expect(screen.getByRole('button', { name: /save as variable/i })).toBeInTheDocument();
    fireEvent.mouseDown(pre);
    expect(screen.queryByRole('button', { name: /save as variable/i })).not.toBeInTheDocument();
  });
});

// US-2 (0003): Create Env Variable From Response

describe('ResponseBody — SaveVarDialog integration', () => {
  it('opens SaveVarDialog when the save button is clicked', async () => {
    const user = userEvent.setup();
    resetStore({ activeEnvironmentId: 'env-1', variables: { 'env-1': [] } });
    render(<ResponseBody body="token-value" />);
    const pre = document.querySelector('pre')!;
    mockSelectionInside(pre, 'token-value');
    fireEvent.mouseUp(pre);
    await user.click(screen.getByRole('button', { name: /save as variable/i }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    // The dialog's value preview shows the selected text
    expect(screen.getByTitle('token-value')).toBeInTheDocument();
  });

  it('closes SaveVarDialog when Cancel is clicked', async () => {
    const user = userEvent.setup();
    resetStore({ activeEnvironmentId: 'env-1', variables: { 'env-1': [] } });
    render(<ResponseBody body="token-value" />);
    const pre = document.querySelector('pre')!;
    mockSelectionInside(pre, 'token-value');
    fireEvent.mouseUp(pre);
    await user.click(screen.getByRole('button', { name: /save as variable/i }));
    await user.click(screen.getByRole('button', { name: /cancel/i }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('passes existing env variables to the dialog', async () => {
    const user = userEvent.setup();
    const vars = [{ id: 1, environment_id: 'env-1', key: 'API_KEY', value: 'x' }];
    resetStore({ activeEnvironmentId: 'env-1', variables: { 'env-1': vars } });
    render(<ResponseBody body="new-value" />);
    const pre = document.querySelector('pre')!;
    mockSelectionInside(pre, 'new-value');
    fireEvent.mouseUp(pre);
    await user.click(screen.getByRole('button', { name: /save as variable/i }));
    // "Set existing" tab should be enabled since vars exist
    expect(screen.getByRole('button', { name: /set existing/i })).not.toBeDisabled();
  });
});

// US-3 (0003): Auto Populate Variable Value

describe('ResponseBody — save flow and toast', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  /** Shared helper: render, select text, open dialog, type name, click Save. */
  async function triggerSave(user: ReturnType<typeof userEvent.setup>, varName = 'TOKEN') {
    render(<ResponseBody body="abc" />);
    const pre = document.querySelector('pre')!;
    mockSelectionInside(pre, 'abc');
    fireEvent.mouseUp(pre);
    await user.click(screen.getByRole('button', { name: /save as variable/i }));
    await user.type(screen.getByLabelText(/variable name/i), varName);
    await user.click(screen.getByRole('button', { name: /^save$/i }));
  }

  it('shows success toast after saving a variable', async () => {
    const user = userEvent.setup();
    vi.mocked(App.SetVariable).mockResolvedValue({ id: 1, environment_id: 'env-1', key: 'TOKEN', value: 'abc' });
    vi.mocked(App.GetVariables).mockResolvedValue([]);
    resetStore({ activeEnvironmentId: 'env-1', variables: { 'env-1': [] } });
    await triggerSave(user);
    await act(async () => {});
    expect(screen.queryByText(/saved as/i)).toBeInTheDocument();
    expect(screen.queryByText('{{TOKEN}}')).toBeInTheDocument();
  });

  it('dismisses the dialog after a successful save', async () => {
    const user = userEvent.setup();
    vi.mocked(App.SetVariable).mockResolvedValue({ id: 1, environment_id: 'env-1', key: 'TOKEN', value: 'abc' });
    vi.mocked(App.GetVariables).mockResolvedValue([]);
    resetStore({ activeEnvironmentId: 'env-1', variables: { 'env-1': [] } });
    await triggerSave(user);
    await act(async () => {});
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('toast auto-dismisses after 2 seconds', async () => {
    vi.useFakeTimers();
    vi.mocked(App.SetVariable).mockResolvedValue({ id: 1, environment_id: 'env-1', key: 'TOKEN', value: 'abc' });
    vi.mocked(App.GetVariables).mockResolvedValue([]);
    resetStore({ activeEnvironmentId: 'env-1', variables: { 'env-1': [] } });
    render(<ResponseBody body="abc" />);
    const pre = document.querySelector('pre')!;
    mockSelectionInside(pre, 'abc');
    // Use fireEvent (synchronous) to avoid userEvent timer complications with fake timers
    fireEvent.mouseUp(pre);
    fireEvent.click(screen.getByRole('button', { name: /save as variable/i }));
    fireEvent.change(screen.getByLabelText(/variable name/i), { target: { value: 'TOKEN' } });
    fireEvent.click(screen.getByRole('button', { name: /^save$/i }));
    // Flush microtasks from the async save handler
    await act(async () => {});
    expect(screen.queryByText(/saved as/i)).toBeInTheDocument();
    // Fire the 2s auto-dismiss timer
    await act(async () => { await vi.runAllTimersAsync(); });
    expect(screen.queryByText(/saved as/i)).not.toBeInTheDocument();
  });

  it('shows error inside dialog and keeps it open on save failure', async () => {
    const user = userEvent.setup();
    vi.mocked(App.SetVariable).mockRejectedValue(new Error('backend error'));
    resetStore({ activeEnvironmentId: 'env-1', variables: { 'env-1': [] } });
    await triggerSave(user);
    await act(async () => {});
    expect(screen.queryByText(/backend error/i)).toBeInTheDocument();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });
});
