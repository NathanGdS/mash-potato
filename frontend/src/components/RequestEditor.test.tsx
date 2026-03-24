import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import RequestEditor from './RequestEditor';
import { Request } from '../types/request';

// US-4: Use Variables in Requests — {{variable}} syntax must be preserved as-is

// Mock Wails bindings so the component can render without a Wails runtime
vi.mock('../wailsjs/go/main/App', () => ({
  UpdateRequest: vi.fn(() => Promise.resolve()),
  SendRequest: vi.fn(() => Promise.resolve({ StatusCode: 200, StatusText: 'OK', Body: '', Headers: {}, DurationMs: 0, SizeBytes: 0 })),
}));

// Mock the stores to avoid real Wails calls.
// useRequestsStore is called with a selector; useResponseStore is called without one.
vi.mock('../store/requestsStore', () => {
  const updateRequest = vi.fn(() => Promise.resolve());
  const store = { updateRequest };
  return {
    useRequestsStore: (selector?: (s: any) => any) =>
      selector ? selector(store) : store,
  };
});

vi.mock('../store/responseStore', () => {
  const sendRequest = vi.fn(() => Promise.resolve());
  const store = { sendRequest, isLoading: false, error: null };
  return {
    // Called without selector in RequestEditor — return the store object directly
    useResponseStore: (selector?: (s: any) => any) =>
      selector ? selector(store) : store,
  };
});

const makeRequest = (overrides: Partial<Request> = {}): Request => ({
  id: 'req-1',
  collection_id: 'col-1',
  folder_id: null,
  name: 'Test Request',
  method: 'GET',
  url: '',
  headers: '[]',
  params: '[]',
  body_type: 'none',
  body: '',
  auth_type: 'none',
  auth_config: '{}',
  timeout_seconds: 30,
  tests: '',
  pre_script: '',
  post_script: '',
  created_at: '2026-01-01T00:00:00Z',
  ...overrides,
});

describe('RequestEditor — variable syntax (US-4)', () => {
  it('preserves {{base_url}}/users exactly when entered into URL field', () => {
    // Use fireEvent.change to set the value directly, bypassing userEvent special-char escaping.
    // This confirms the URL input performs no filtering or transformation of {{ }} characters.
    render(<RequestEditor request={makeRequest()} />);

    const urlInput = screen.getByRole('textbox', { name: /request url/i });
    fireEvent.change(urlInput, { target: { value: '{{base_url}}/users' } });

    expect(urlInput).toHaveValue('{{base_url}}/users');
  });

  it('displays a placeholder hinting at {{var_name}} syntax on the URL field', () => {
    render(<RequestEditor request={makeRequest()} />);
    const urlInput = screen.getByRole('textbox', { name: /request url/i });
    expect(urlInput).toHaveAttribute('placeholder', expect.stringContaining('{{'));
  });
});
