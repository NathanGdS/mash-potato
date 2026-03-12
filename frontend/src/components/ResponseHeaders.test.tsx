import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import ResponseHeaders from './ResponseHeaders';

// US-13: View Response Headers

describe('ResponseHeaders', () => {
  it('shows empty state message when no headers', () => {
    render(<ResponseHeaders headers={{}} />);
    expect(screen.getByText(/no headers received/i)).toBeInTheDocument();
  });

  it('renders a table when headers are present', () => {
    render(<ResponseHeaders headers={{ 'Content-Type': ['application/json'] }} />);
    expect(screen.getByRole('table')).toBeInTheDocument();
  });

  it('renders header name and value', () => {
    render(<ResponseHeaders headers={{ 'Content-Type': ['application/json'] }} />);
    expect(screen.getByText('Content-Type')).toBeInTheDocument();
    expect(screen.getByText('application/json')).toBeInTheDocument();
  });

  it('renders multiple headers', () => {
    render(
      <ResponseHeaders
        headers={{
          'Content-Type': ['application/json'],
          'X-Request-Id': ['abc-123'],
        }}
      />
    );
    expect(screen.getByText('Content-Type')).toBeInTheDocument();
    expect(screen.getByText('X-Request-Id')).toBeInTheDocument();
    expect(screen.getByText('abc-123')).toBeInTheDocument();
  });

  it('joins multiple values for the same header with comma', () => {
    render(<ResponseHeaders headers={{ 'Set-Cookie': ['a=1', 'b=2'] }} />);
    expect(screen.getByText('a=1, b=2')).toBeInTheDocument();
  });

  it('renders Header and Value column headings', () => {
    render(<ResponseHeaders headers={{ 'X-Foo': ['bar'] }} />);
    expect(screen.getByText('Header')).toBeInTheDocument();
    expect(screen.getByText('Value')).toBeInTheDocument();
  });
});
