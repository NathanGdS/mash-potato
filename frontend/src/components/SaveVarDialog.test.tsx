import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi } from 'vitest';
import { EnvironmentVariable } from '../wailsjs/go/main/App';
import SaveVarDialog from './SaveVarDialog';

const noVars: EnvironmentVariable[] = [];
const someVars: EnvironmentVariable[] = [
  { id: 1, environment_id: 'env-1', key: 'API_KEY', value: 'old-secret' },
  { id: 2, environment_id: 'env-1', key: 'BASE_URL', value: 'https://example.com' },
];

const defaults = {
  selectedValue: 'hello-world',
  existingVars: noVars,
  onSave: vi.fn(),
  onClose: vi.fn(),
};

describe('SaveVarDialog — value preview', () => {
  it('shows the selected value in the preview field', () => {
    render(<SaveVarDialog {...defaults} />);
    expect(screen.getByText('hello-world')).toBeInTheDocument();
  });
});

describe('SaveVarDialog — tabs', () => {
  it('renders both mode tabs', () => {
    render(<SaveVarDialog {...defaults} />);
    expect(screen.getByRole('button', { name: /new variable/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /set existing/i })).toBeInTheDocument();
  });

  it('"New variable" tab is active by default', () => {
    render(<SaveVarDialog {...defaults} />);
    expect(screen.getByRole('button', { name: /new variable/i })).toHaveClass('svd-tab--active');
    expect(screen.getByRole('button', { name: /set existing/i })).not.toHaveClass('svd-tab--active');
  });

  it('"Set existing" tab is disabled when no vars exist', () => {
    render(<SaveVarDialog {...defaults} existingVars={noVars} />);
    expect(screen.getByRole('button', { name: /set existing/i })).toBeDisabled();
  });

  it('"Set existing" tab is enabled when vars exist', () => {
    render(<SaveVarDialog {...defaults} existingVars={someVars} />);
    expect(screen.getByRole('button', { name: /set existing/i })).not.toBeDisabled();
  });

  it('clicking "Set existing" makes it active', async () => {
    const user = userEvent.setup();
    render(<SaveVarDialog {...defaults} existingVars={someVars} />);
    await user.click(screen.getByRole('button', { name: /set existing/i }));
    expect(screen.getByRole('button', { name: /set existing/i })).toHaveClass('svd-tab--active');
    expect(screen.getByRole('button', { name: /new variable/i })).not.toHaveClass('svd-tab--active');
  });
});

describe('SaveVarDialog — new variable mode', () => {
  it('shows a variable name input', () => {
    render(<SaveVarDialog {...defaults} />);
    expect(screen.getByLabelText(/variable name/i)).toBeInTheDocument();
  });

  it('Save button is disabled when name is empty', () => {
    render(<SaveVarDialog {...defaults} />);
    expect(screen.getByRole('button', { name: /^save$/i })).toBeDisabled();
  });

  it('Save button becomes enabled after typing a name', async () => {
    const user = userEvent.setup();
    render(<SaveVarDialog {...defaults} />);
    await user.type(screen.getByLabelText(/variable name/i), 'MY_VAR');
    expect(screen.getByRole('button', { name: /^save$/i })).not.toBeDisabled();
  });

  it('calls onSave with trimmed name and selected value', async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    render(<SaveVarDialog {...defaults} onSave={onSave} />);
    await user.type(screen.getByLabelText(/variable name/i), 'MY_VAR');
    await user.click(screen.getByRole('button', { name: /^save$/i }));
    expect(onSave).toHaveBeenCalledWith('MY_VAR', 'hello-world');
  });

  it('calls onSave when Enter is pressed in the name input', async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    render(<SaveVarDialog {...defaults} onSave={onSave} />);
    await user.type(screen.getByLabelText(/variable name/i), 'MY_VAR{Enter}');
    expect(onSave).toHaveBeenCalledWith('MY_VAR', 'hello-world');
  });

  it('calls onClose when Escape is pressed in the name input', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<SaveVarDialog {...defaults} onClose={onClose} />);
    await user.type(screen.getByLabelText(/variable name/i), '{Escape}');
    expect(onClose).toHaveBeenCalled();
  });

  it('does not call onSave when Save is clicked with whitespace-only name', async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    render(<SaveVarDialog {...defaults} onSave={onSave} />);
    // type spaces then try to click save (button stays disabled)
    const input = screen.getByLabelText(/variable name/i);
    await user.type(input, '   ');
    expect(screen.getByRole('button', { name: /^save$/i })).toBeDisabled();
    expect(onSave).not.toHaveBeenCalled();
  });
});

describe('SaveVarDialog — set existing mode', () => {
  it('shows a dropdown with existing var names', async () => {
    const user = userEvent.setup();
    render(<SaveVarDialog {...defaults} existingVars={someVars} />);
    await user.click(screen.getByRole('button', { name: /set existing/i }));
    expect(screen.getByRole('combobox')).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'API_KEY' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'BASE_URL' })).toBeInTheDocument();
  });

  it('Save button is enabled with the first var pre-selected', async () => {
    const user = userEvent.setup();
    render(<SaveVarDialog {...defaults} existingVars={someVars} />);
    await user.click(screen.getByRole('button', { name: /set existing/i }));
    expect(screen.getByRole('button', { name: /^save$/i })).not.toBeDisabled();
  });

  it('calls onSave with selected key and selected value', async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    render(<SaveVarDialog {...defaults} existingVars={someVars} onSave={onSave} />);
    await user.click(screen.getByRole('button', { name: /set existing/i }));
    await user.selectOptions(screen.getByRole('combobox'), 'BASE_URL');
    await user.click(screen.getByRole('button', { name: /^save$/i }));
    expect(onSave).toHaveBeenCalledWith('BASE_URL', 'hello-world');
  });

  it('calls onClose when Escape is pressed in the dropdown', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<SaveVarDialog {...defaults} existingVars={someVars} onClose={onClose} />);
    await user.click(screen.getByRole('button', { name: /set existing/i }));
    screen.getByRole('combobox').focus();
    await user.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalled();
  });
});

describe('SaveVarDialog — cancel and dismiss', () => {
  it('calls onClose when Cancel is clicked', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<SaveVarDialog {...defaults} onClose={onClose} />);
    await user.click(screen.getByRole('button', { name: /cancel/i }));
    expect(onClose).toHaveBeenCalled();
  });

  it('calls onClose when the overlay backdrop is clicked', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<SaveVarDialog {...defaults} onClose={onClose} />);
    // The overlay is the outer div; click on it (not the dialog itself)
    const overlay = document.querySelector('.svd-overlay')!;
    await user.pointer({ target: overlay, coords: { clientX: 5, clientY: 5 } });
    // fireEvent is more reliable for hitting the overlay directly
    const { fireEvent } = await import('@testing-library/react');
    fireEvent.mouseDown(overlay);
    expect(onClose).toHaveBeenCalled();
  });
});

describe('SaveVarDialog — saving state', () => {
  it('shows "Saving…" label while saving', () => {
    render(<SaveVarDialog {...defaults} saving={true} />);
    expect(screen.getByRole('button', { name: /saving/i })).toBeInTheDocument();
  });

  it('Save button is disabled while saving', () => {
    render(<SaveVarDialog {...defaults} saving={true} />);
    expect(screen.getByRole('button', { name: /saving/i })).toBeDisabled();
  });

  it('Cancel button is disabled while saving', () => {
    render(<SaveVarDialog {...defaults} saving={true} />);
    expect(screen.getByRole('button', { name: /cancel/i })).toBeDisabled();
  });
});

describe('SaveVarDialog — error state', () => {
  it('shows the error message', () => {
    render(<SaveVarDialog {...defaults} error="Network error" />);
    expect(screen.getByText('Network error')).toBeInTheDocument();
  });

  it('does not show error container when error is null', () => {
    render(<SaveVarDialog {...defaults} error={null} />);
    expect(screen.queryByText(/error/i)).not.toBeInTheDocument();
  });
});
