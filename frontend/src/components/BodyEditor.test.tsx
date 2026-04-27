import { render, screen, fireEvent, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useState } from 'react';
import BodyEditor, { BodyType } from './BodyEditor';

// Mock VarPopover with a testable implementation
vi.mock('./VarPopover', () => ({
  default: ({ open, items }: { open: boolean; items: string[] }) =>
    open && items.length > 0 ? (
      <ul data-testid="var-popover">
        {items.map((name) => (
          <li key={name}>{name}</li>
        ))}
      </ul>
    ) : null,
}));

vi.mock('./VarTooltip', () => ({ default: () => null }));

// Provide some var keys from the environment store
vi.mock('../store/environmentsStore', () => {
  const vars = { '__global__': [{ id: 1, environment_id: '__global__', key: 'baseUrl', value: 'http://localhost', is_secret: false }] };
  const store = {
    activeEnvironmentId: '',
    globalEnvironmentId: '__global__',
    variables: vars,
    fetchVariables: vi.fn(),
  };
  return {
    useEnvironmentsStore: (sel?: (s: any) => any) => (sel ? sel(store) : store),
  };
});

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

function ControlledBodyEditor({ bodyType }: { bodyType: BodyType }) {
  const [body, setBody] = useState('');
  return (
    <BodyEditor
      method="POST"
      bodyType={bodyType}
      body={body}
      onBodyTypeChange={vi.fn()}
      onBodyChange={setBody}
    />
  );
}

describe('BodyEditor — VarPopover on {{ trigger', () => {
  it('shows VarPopover when {{ is typed in raw body textarea', async () => {
    render(<ControlledBodyEditor bodyType="raw" />);

    const textarea = screen.getByRole('textbox', { name: /request body/i });
    expect(textarea).toBeInTheDocument();

    await act(async () => {
      // Set selectionStart so getTriggerAtCursor detects the cursor inside {{
      Object.defineProperty(textarea, 'selectionStart', { configurable: true, get: () => 2 });
      fireEvent.change(textarea, { target: { value: '{{' } });
      vi.runAllTimers();
    });

    expect(screen.getByTestId('var-popover')).toBeInTheDocument();
  });

  it('shows VarPopover when {{ is typed in json body textarea', async () => {
    render(<ControlledBodyEditor bodyType="json" />);

    const textarea = screen.getByRole('textbox', { name: /request body/i });

    await act(async () => {
      Object.defineProperty(textarea, 'selectionStart', { configurable: true, get: () => 2 });
      fireEvent.change(textarea, { target: { value: '{{' } });
      vi.runAllTimers();
    });

    expect(screen.getByTestId('var-popover')).toBeInTheDocument();
  });
});
