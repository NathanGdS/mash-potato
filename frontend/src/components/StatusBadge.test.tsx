import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import StatusBadge from './StatusBadge';

// US-11: View Response Status — color coding and text display

describe('StatusBadge', () => {
  it('renders status code and text', () => {
    render(<StatusBadge statusCode={200} statusText="OK" />);
    expect(screen.getByText('200 OK')).toBeInTheDocument();
  });

  it('applies 2xx class for 200', () => {
    const { container } = render(<StatusBadge statusCode={200} statusText="OK" />);
    expect(container.firstChild).toHaveClass('status-badge--2xx');
  });

  it('applies 2xx class for 201', () => {
    const { container } = render(<StatusBadge statusCode={201} statusText="Created" />);
    expect(container.firstChild).toHaveClass('status-badge--2xx');
  });

  it('applies 3xx class for 301', () => {
    const { container } = render(<StatusBadge statusCode={301} statusText="Moved Permanently" />);
    expect(container.firstChild).toHaveClass('status-badge--3xx');
  });

  it('applies 4xx class for 404', () => {
    const { container } = render(<StatusBadge statusCode={404} statusText="Not Found" />);
    expect(container.firstChild).toHaveClass('status-badge--4xx');
  });

  it('applies 4xx class for 400', () => {
    const { container } = render(<StatusBadge statusCode={400} statusText="Bad Request" />);
    expect(container.firstChild).toHaveClass('status-badge--4xx');
  });

  it('applies 5xx class for 500', () => {
    const { container } = render(<StatusBadge statusCode={500} statusText="Internal Server Error" />);
    expect(container.firstChild).toHaveClass('status-badge--5xx');
  });

  it('applies 5xx class for 503', () => {
    const { container } = render(<StatusBadge statusCode={503} statusText="Service Unavailable" />);
    expect(container.firstChild).toHaveClass('status-badge--5xx');
  });

  it('applies other class for unknown codes', () => {
    const { container } = render(<StatusBadge statusCode={0} statusText="Unknown" />);
    expect(container.firstChild).toHaveClass('status-badge--other');
  });

  it('always has base status-badge class', () => {
    const { container } = render(<StatusBadge statusCode={200} statusText="OK" />);
    expect(container.firstChild).toHaveClass('status-badge');
  });
});
