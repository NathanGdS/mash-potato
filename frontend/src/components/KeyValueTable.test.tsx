import { useState } from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi } from 'vitest';
import KeyValueTable, { KVRow } from './KeyValueTable';

// US-7/8: Headers and Query Params — add, edit, remove, enable/disable rows

const makeRows = (...items: Partial<KVRow>[]): KVRow[] =>
  items.map((item) => ({ key: '', value: '', enabled: true, ...item }));

/** Wrapper that wires onChange back to state so the component re-renders properly. */
function Controlled({ initial }: { initial: KVRow[] }) {
  const [rows, setRows] = useState(initial);
  return <KeyValueTable rows={rows} onChange={setRows} />;
}

describe('KeyValueTable', () => {
  it('renders existing rows', () => {
    const rows = makeRows({ key: 'Authorization', value: 'Bearer token' });
    render(<KeyValueTable rows={rows} onChange={() => {}} />);
    expect(screen.getByDisplayValue('Authorization')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Bearer token')).toBeInTheDocument();
  });

  it('renders Add Row button', () => {
    render(<KeyValueTable rows={[]} onChange={() => {}} />);
    expect(screen.getByRole('button', { name: /add row/i })).toBeInTheDocument();
  });

  it('calls onChange with new row when Add Row is clicked', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<KeyValueTable rows={[]} onChange={onChange} />);
    await user.click(screen.getByRole('button', { name: /add row/i }));
    expect(onChange).toHaveBeenCalledWith([{ key: '', value: '', enabled: true }]);
  });

  it('calls onChange with updated key when key input changes', async () => {
    const user = userEvent.setup();
    render(<Controlled initial={makeRows({ key: '', value: '', enabled: true })} />);
    const keyInput = screen.getAllByPlaceholderText('Key')[0];
    await user.type(keyInput, 'X-Foo');
    expect(keyInput).toHaveValue('X-Foo');
  });

  it('calls onChange with updated value when value input changes', async () => {
    const user = userEvent.setup();
    render(<Controlled initial={makeRows({ key: 'X-Foo', value: '', enabled: true })} />);
    const valueInput = screen.getAllByPlaceholderText('Value')[0];
    await user.type(valueInput, 'bar');
    expect(valueInput).toHaveValue('bar');
  });

  it('calls onChange with row removed when Remove button is clicked', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const rows = makeRows({ key: 'foo', value: 'bar' }, { key: 'baz', value: 'qux' });
    render(<KeyValueTable rows={rows} onChange={onChange} />);
    const removeButtons = screen.getAllByRole('button', { name: /remove row/i });
    await user.click(removeButtons[0]);
    const updated = onChange.mock.calls[0][0] as KVRow[];
    expect(updated).toHaveLength(1);
    expect(updated[0].key).toBe('baz');
  });

  it('calls onChange with toggled enabled when checkbox is clicked', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const rows = makeRows({ key: 'X-Foo', value: 'bar', enabled: true });
    render(<KeyValueTable rows={rows} onChange={onChange} />);
    const checkbox = screen.getByRole('checkbox', { name: /enable row/i });
    await user.click(checkbox);
    const updated = onChange.mock.calls[0][0] as KVRow[];
    expect(updated[0].enabled).toBe(false);
  });

  it('applies disabled row class when row is not enabled', () => {
    const rows = makeRows({ key: 'foo', value: 'bar', enabled: false });
    render(<KeyValueTable rows={rows} onChange={() => {}} />);
    const row = document.querySelector('tbody tr');
    expect(row).toHaveClass('kv-row-disabled');
  });

  it('does not apply disabled class for enabled row', () => {
    const rows = makeRows({ key: 'foo', value: 'bar', enabled: true });
    render(<KeyValueTable rows={rows} onChange={() => {}} />);
    const row = document.querySelector('tbody tr');
    expect(row).not.toHaveClass('kv-row-disabled');
  });

  it('renders custom key/value placeholders in inputs', () => {
    render(
      <KeyValueTable
        rows={makeRows({ key: '', value: '' })}
        onChange={() => {}}
        keyPlaceholder="Header Name"
        valuePlaceholder="Header Value"
      />
    );
    expect(screen.getByPlaceholderText('Header Name')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Header Value')).toBeInTheDocument();
  });

  it('renders multiple rows correctly', () => {
    const rows = makeRows(
      { key: 'foo', value: '1' },
      { key: 'bar', value: '2' },
      { key: 'baz', value: '3' }
    );
    render(<KeyValueTable rows={rows} onChange={() => {}} />);
    expect(screen.getAllByRole('row')).toHaveLength(4); // thead + 3 body rows
  });

  // US-4: Use Variables in Requests — {{variable}} syntax must not be transformed
  it('preserves {{api_key}} exactly when entered as a header value', () => {
    // Use fireEvent.change to set the value directly, bypassing userEvent special-char escaping.
    // This confirms the input performs no filtering or transformation of {{ }} characters.
    render(<Controlled initial={makeRows({ key: 'Authorization', value: '', enabled: true })} />);
    const valueInput = screen.getAllByPlaceholderText('Value')[0];
    fireEvent.change(valueInput, { target: { value: '{{api_key}}' } });
    expect(valueInput).toHaveValue('{{api_key}}');
  });

  it('renders an existing row whose value contains {{ }} without modification', () => {
    const rows = makeRows({ key: 'X-Token', value: '{{auth_token}}' });
    render(<KeyValueTable rows={rows} onChange={() => {}} />);
    expect(screen.getByDisplayValue('{{auth_token}}')).toBeInTheDocument();
  });
});
