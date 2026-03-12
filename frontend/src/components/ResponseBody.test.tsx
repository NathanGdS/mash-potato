import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect } from 'vitest';
import ResponseBody from './ResponseBody';

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
