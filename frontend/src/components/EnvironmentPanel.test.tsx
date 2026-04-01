import React from 'react';
import { render, screen, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mock ReactDOM.createPortal so the component renders inline in tests
vi.mock('react-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-dom')>();
  return {
    ...actual,
    createPortal: (node: React.ReactNode) => node,
  };
});

// Mock the Wails bindings
vi.mock('../wailsjs/go/main/App', () => ({
  CreateEnvironment: vi.fn(),
  ListEnvironments: vi.fn(),
  RenameEnvironment: vi.fn(),
  DeleteEnvironment: vi.fn(),
  GetVariables: vi.fn(),
  SetVariable: vi.fn(),
  SetSecretVariable: vi.fn(),
  DeleteVariable: vi.fn(),
  GetActiveEnvironment: vi.fn(),
  SetActiveEnvironment: vi.fn(),
  GetGlobalEnvironmentID: vi.fn(),
  ToggleVariableSecret: vi.fn(),
}));

// Mock the environments store
vi.mock('../store/environmentsStore');

import { useEnvironmentsStore } from '../store/environmentsStore';
import EnvironmentPanel from './EnvironmentPanel';
import { EnvironmentVariable } from '../wailsjs/go/main/App';

const mockEnv = { id: 'env-1', name: 'Development', created_at: '2024-01-01T00:00:00Z', is_global: false };

const plainVar: EnvironmentVariable = {
  id: 1,
  environment_id: 'env-1',
  key: 'API_URL',
  value: 'https://example.com',
  is_secret: false,
};

const secretVar: EnvironmentVariable = {
  id: 2,
  environment_id: 'env-1',
  key: 'API_KEY',
  value: 'super-secret-value',
  is_secret: true,
};

const makeStoreMock = (vars: EnvironmentVariable[] = []) => ({
  environments: [mockEnv],
  loading: false,
  variables: { 'env-1': vars },
  globalEnvironmentId: '',
  fetchEnvironments: vi.fn(),
  createEnvironment: vi.fn(),
  renameEnvironment: vi.fn(),
  deleteEnvironment: vi.fn(),
  fetchVariables: vi.fn(),
  setVariable: vi.fn(),
  setSecretVariable: vi.fn(),
  deleteVariable: vi.fn(),
  toggleVariableSecret: vi.fn(),
});

beforeEach(() => {
  vi.clearAllMocks();
});

// ── Masking render ────────────────────────────────────────────────────────────

describe('EnvironmentPanel — secret variable masking', () => {
  it('renders plain text value for non-secret variables', () => {
    vi.mocked(useEnvironmentsStore).mockReturnValue(makeStoreMock([plainVar]) as any);
    render(<EnvironmentPanel onClose={vi.fn()} />);
    expect(screen.getByText('https://example.com')).toBeInTheDocument();
  });

  it('renders masked display (••••••) for secret variables', () => {
    vi.mocked(useEnvironmentsStore).mockReturnValue(makeStoreMock([secretVar]) as any);
    render(<EnvironmentPanel onClose={vi.fn()} />);
    expect(screen.getByText('••••••')).toBeInTheDocument();
    expect(screen.queryByText('super-secret-value')).not.toBeInTheDocument();
  });

  it('applies secret-value-masked class to the masked span', () => {
    vi.mocked(useEnvironmentsStore).mockReturnValue(makeStoreMock([secretVar]) as any);
    render(<EnvironmentPanel onClose={vi.fn()} />);
    const masked = screen.getByText('••••••');
    expect(masked).toHaveClass('secret-value-masked');
  });

  it('does not render the eye icon for non-secret variables', () => {
    vi.mocked(useEnvironmentsStore).mockReturnValue(makeStoreMock([plainVar]) as any);
    render(<EnvironmentPanel onClose={vi.fn()} />);
    expect(screen.queryByRole('button', { name: /reveal value/i })).not.toBeInTheDocument();
  });

  it('renders the eye button for secret variables', () => {
    vi.mocked(useEnvironmentsStore).mockReturnValue(makeStoreMock([secretVar]) as any);
    render(<EnvironmentPanel onClose={vi.fn()} />);
    expect(screen.getByRole('button', { name: /reveal value for api_key/i })).toBeInTheDocument();
  });
});

// ── Lock toggle ───────────────────────────────────────────────────────────────

describe('EnvironmentPanel — lock toggle', () => {
  it('renders lock button for each variable row', () => {
    vi.mocked(useEnvironmentsStore).mockReturnValue(makeStoreMock([plainVar, secretVar]) as any);
    render(<EnvironmentPanel onClose={vi.fn()} />);
    expect(screen.getByRole('button', { name: /mark api_url as secret/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /unmark api_key as secret/i })).toBeInTheDocument();
  });

  it('calls toggleVariableSecret with (envId, varId, true) when locking a plain variable', async () => {
    const store = makeStoreMock([plainVar]);
    vi.mocked(useEnvironmentsStore).mockReturnValue(store as any);
    const user = userEvent.setup();
    render(<EnvironmentPanel onClose={vi.fn()} />);
    await user.click(screen.getByRole('button', { name: /mark api_url as secret/i }));
    expect(store.toggleVariableSecret).toHaveBeenCalledWith('env-1', plainVar.id, true);
  });

  it('calls toggleVariableSecret with (envId, varId, false) when unlocking a secret variable', async () => {
    const store = makeStoreMock([secretVar]);
    vi.mocked(useEnvironmentsStore).mockReturnValue(store as any);
    const user = userEvent.setup();
    render(<EnvironmentPanel onClose={vi.fn()} />);
    await user.click(screen.getByRole('button', { name: /unmark api_key as secret/i }));
    expect(store.toggleVariableSecret).toHaveBeenCalledWith('env-1', secretVar.id, false);
  });

  it('locked button has env-var-lock-btn--locked class', () => {
    vi.mocked(useEnvironmentsStore).mockReturnValue(makeStoreMock([secretVar]) as any);
    render(<EnvironmentPanel onClose={vi.fn()} />);
    const lockBtn = screen.getByRole('button', { name: /unmark api_key as secret/i });
    expect(lockBtn).toHaveClass('env-var-lock-btn--locked');
  });

  it('unlocked button does not have env-var-lock-btn--locked class', () => {
    vi.mocked(useEnvironmentsStore).mockReturnValue(makeStoreMock([plainVar]) as any);
    render(<EnvironmentPanel onClose={vi.fn()} />);
    const lockBtn = screen.getByRole('button', { name: /mark api_url as secret/i });
    expect(lockBtn).not.toHaveClass('env-var-lock-btn--locked');
  });
});

// ── Eye reveal timer ──────────────────────────────────────────────────────────

describe('EnvironmentPanel — eye reveal timer', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('reveals plaintext value when eye button is clicked', () => {
    vi.mocked(useEnvironmentsStore).mockReturnValue(makeStoreMock([secretVar]) as any);
    render(<EnvironmentPanel onClose={vi.fn()} />);

    expect(screen.getByText('••••••')).toBeInTheDocument();
    act(() => {
      screen.getByRole('button', { name: /reveal value for api_key/i }).click();
    });
    expect(screen.getByText('super-secret-value')).toBeInTheDocument();
    expect(screen.queryByText('••••••')).not.toBeInTheDocument();
  });

  it('re-masks the value after exactly 5 seconds', () => {
    vi.mocked(useEnvironmentsStore).mockReturnValue(makeStoreMock([secretVar]) as any);
    render(<EnvironmentPanel onClose={vi.fn()} />);

    act(() => {
      screen.getByRole('button', { name: /reveal value for api_key/i }).click();
    });
    expect(screen.getByText('super-secret-value')).toBeInTheDocument();

    act(() => { vi.advanceTimersByTime(5000); });

    expect(screen.queryByText('super-secret-value')).not.toBeInTheDocument();
    expect(screen.getByText('••••••')).toBeInTheDocument();
  });

  it('does not re-mask before 5 seconds have elapsed', () => {
    vi.mocked(useEnvironmentsStore).mockReturnValue(makeStoreMock([secretVar]) as any);
    render(<EnvironmentPanel onClose={vi.fn()} />);

    act(() => {
      screen.getByRole('button', { name: /reveal value for api_key/i }).click();
    });

    act(() => { vi.advanceTimersByTime(4999); });

    expect(screen.getByText('super-secret-value')).toBeInTheDocument();
  });
});

// ── Broken variable recovery UI ───────────────────────────────────────────────

const brokenVar: EnvironmentVariable = {
  id: 3,
  environment_id: 'env-1',
  key: 'DB_PASSWORD',
  value: '',
  is_secret: true,
  broken: true,
};

describe('EnvironmentPanel — broken variable recovery UI', () => {
  it('renders the broken-state banner when at least one variable has broken: true', () => {
    vi.mocked(useEnvironmentsStore).mockReturnValue(makeStoreMock([brokenVar]) as any);
    render(<EnvironmentPanel onClose={vi.fn()} />);
    expect(
      screen.getByRole('alert')
    ).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent(
      /could not be decrypted/i
    );
  });

  it('does not render the broken-state banner when no variable is broken', () => {
    vi.mocked(useEnvironmentsStore).mockReturnValue(makeStoreMock([plainVar, secretVar]) as any);
    render(<EnvironmentPanel onClose={vi.fn()} />);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('renders the broken row with env-vars-row--broken class', () => {
    vi.mocked(useEnvironmentsStore).mockReturnValue(makeStoreMock([brokenVar]) as any);
    render(<EnvironmentPanel onClose={vi.fn()} />);
    // The re-entry input is the reliable indicator that the broken row rendered
    const input = screen.getByPlaceholderText(/decryption failed — re-enter value/i);
    const row = input.closest('tr');
    expect(row).toHaveClass('env-vars-row--broken');
  });

  it('renders the re-entry input with placeholder text for broken variables', () => {
    vi.mocked(useEnvironmentsStore).mockReturnValue(makeStoreMock([brokenVar]) as any);
    render(<EnvironmentPanel onClose={vi.fn()} />);
    const input = screen.getByPlaceholderText(/decryption failed — re-enter value/i);
    expect(input).toBeInTheDocument();
  });

  it('applies env-var-input--broken class to the re-entry input', () => {
    vi.mocked(useEnvironmentsStore).mockReturnValue(makeStoreMock([brokenVar]) as any);
    render(<EnvironmentPanel onClose={vi.fn()} />);
    const input = screen.getByPlaceholderText(/decryption failed — re-enter value/i);
    expect(input).toHaveClass('env-var-input--broken');
  });

  it('renders the key name in the broken row', () => {
    vi.mocked(useEnvironmentsStore).mockReturnValue(makeStoreMock([brokenVar]) as any);
    render(<EnvironmentPanel onClose={vi.fn()} />);
    expect(screen.getByText('DB_PASSWORD')).toBeInTheDocument();
  });

  it('does not render the eye-reveal button for broken variables', () => {
    vi.mocked(useEnvironmentsStore).mockReturnValue(makeStoreMock([brokenVar]) as any);
    render(<EnvironmentPanel onClose={vi.fn()} />);
    expect(screen.queryByRole('button', { name: /reveal value for db_password/i })).not.toBeInTheDocument();
  });

  it('calls setSecretVariable with envId, key, and new value when Enter is pressed', async () => {
    const store = makeStoreMock([brokenVar]);
    vi.mocked(useEnvironmentsStore).mockReturnValue(store as any);
    const user = userEvent.setup();
    render(<EnvironmentPanel onClose={vi.fn()} />);

    const input = screen.getByPlaceholderText(/decryption failed — re-enter value/i);
    await user.type(input, 'new-secret-value');
    await user.keyboard('{Enter}');

    expect(store.setSecretVariable).toHaveBeenCalledWith('env-1', 'DB_PASSWORD', 'new-secret-value');
  });

  it('does not call setSecretVariable when re-entry input is empty', async () => {
    const store = makeStoreMock([brokenVar]);
    vi.mocked(useEnvironmentsStore).mockReturnValue(store as any);
    const user = userEvent.setup();
    render(<EnvironmentPanel onClose={vi.fn()} />);

    const input = screen.getByPlaceholderText(/decryption failed — re-enter value/i);
    await user.click(input);
    await user.keyboard('{Enter}');

    expect(store.setSecretVariable).not.toHaveBeenCalled();
  });

  it('non-broken variables remain fully functional alongside broken ones', () => {
    vi.mocked(useEnvironmentsStore).mockReturnValue(
      makeStoreMock([plainVar, brokenVar]) as any
    );
    render(<EnvironmentPanel onClose={vi.fn()} />);

    // Normal variable still shows its value
    expect(screen.getByText('https://example.com')).toBeInTheDocument();
    // Broken variable shows re-entry input
    expect(screen.getByPlaceholderText(/decryption failed — re-enter value/i)).toBeInTheDocument();
  });

  it('the broken row has an accessible label on the re-entry input', () => {
    vi.mocked(useEnvironmentsStore).mockReturnValue(makeStoreMock([brokenVar]) as any);
    render(<EnvironmentPanel onClose={vi.fn()} />);
    expect(
      screen.getByRole('textbox', { name: /re-enter value for broken variable db_password/i })
    ).toBeInTheDocument();
  });

  it('broken indicator and warning banner disappear after successful re-save', async () => {
    // First render: store returns a broken variable
    const store = makeStoreMock([brokenVar]);
    // When setSecretVariable is called, simulate the store updating the variable
    // to non-broken by switching the mock to return a fixed variable
    const fixedVar: EnvironmentVariable = {
      ...brokenVar,
      broken: false,
      value: 'new-secret-value',
    };
    store.setSecretVariable.mockImplementation(async () => {
      // After the call, update the mock to return the fixed variable
      vi.mocked(useEnvironmentsStore).mockReturnValue(
        makeStoreMock([fixedVar]) as any
      );
    });
    vi.mocked(useEnvironmentsStore).mockReturnValue(store as any);

    const user = userEvent.setup();
    const { rerender } = render(<EnvironmentPanel onClose={vi.fn()} />);

    // Broken state is visible before re-save
    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/decryption failed — re-enter value/i)).toBeInTheDocument();

    // Type a new value and press Enter
    const input = screen.getByPlaceholderText(/decryption failed — re-enter value/i);
    await user.type(input, 'new-secret-value');
    await user.keyboard('{Enter}');

    expect(store.setSecretVariable).toHaveBeenCalledWith('env-1', 'DB_PASSWORD', 'new-secret-value');

    // Re-render with the updated store (simulating a state change after the store action completes)
    rerender(<EnvironmentPanel onClose={vi.fn()} />);

    // Broken indicator and warning banner should be gone
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.queryByPlaceholderText(/decryption failed — re-enter value/i)).not.toBeInTheDocument();
    expect(screen.queryByRole('row', { name: '' })?.classList.contains('env-vars-row--broken')).toBeFalsy();
  });
});

// ── Re-mask on unmount ────────────────────────────────────────────────────────

describe('EnvironmentPanel — re-mask on unmount', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('calls clearTimeout on unmount to clean up reveal timer', () => {
    const clearTimeoutSpy = vi.spyOn(window, 'clearTimeout');
    vi.mocked(useEnvironmentsStore).mockReturnValue(makeStoreMock([secretVar]) as any);
    const { unmount } = render(<EnvironmentPanel onClose={vi.fn()} />);

    act(() => {
      screen.getByRole('button', { name: /reveal value for api_key/i }).click();
    });

    // Timer is active; unmounting should clear it
    act(() => { unmount(); });

    expect(clearTimeoutSpy).toHaveBeenCalled();
    clearTimeoutSpy.mockRestore();
  });

  it('orphaned timer from unmounted instance does not affect re-mounted instance', () => {
    vi.mocked(useEnvironmentsStore).mockReturnValue(makeStoreMock([secretVar]) as any);

    // Step 1: Mount and reveal — 2 s of the 5 s timer elapse (3 s remain)
    const { unmount } = render(<EnvironmentPanel onClose={vi.fn()} />);
    act(() => {
      screen.getByRole('button', { name: /reveal value for api_key/i }).click();
    });
    act(() => { vi.advanceTimersByTime(2000); }); // still revealed — timer running
    expect(screen.getByText('super-secret-value')).toBeInTheDocument();

    // Step 2: Unmount — the component's cleanup (clearTimeout) should fire
    act(() => { unmount(); });

    // Step 3: Re-mount a fresh instance — it starts masked
    render(<EnvironmentPanel onClose={vi.fn()} />);
    expect(screen.getByText('••••••')).toBeInTheDocument();
    expect(screen.queryByText('super-secret-value')).not.toBeInTheDocument();

    // Step 4: Fire the remaining 3 s that the orphaned timer from the first
    // instance would have used. If clearTimeout was NOT called on unmount,
    // the orphaned callback would still be in the queue and could mutate
    // shared state or throw. The new instance must stay masked throughout.
    act(() => { vi.advanceTimersByTime(3000); });

    expect(screen.getByText('••••••')).toBeInTheDocument();
    expect(screen.queryByText('super-secret-value')).not.toBeInTheDocument();
  });
});
