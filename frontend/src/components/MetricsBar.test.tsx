import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import MetricsBar from './MetricsBar';

// US-14: View Request Metrics — duration and size formatting

describe('MetricsBar', () => {
  it('displays duration in milliseconds', () => {
    render(<MetricsBar durationMs={142} sizeBytes={0} />);
    expect(screen.getByText('142 ms')).toBeInTheDocument();
  });

  it('displays size in bytes when < 1024', () => {
    render(<MetricsBar durationMs={0} sizeBytes={340} />);
    expect(screen.getByText('340 B')).toBeInTheDocument();
  });

  it('displays size in KB for exactly 1024 bytes', () => {
    render(<MetricsBar durationMs={0} sizeBytes={1024} />);
    expect(screen.getByText('1.0 KB')).toBeInTheDocument();
  });

  it('displays size in KB with 1 decimal for larger values', () => {
    render(<MetricsBar durationMs={0} sizeBytes={1229} />);
    expect(screen.getByText('1.2 KB')).toBeInTheDocument();
  });

  it('displays 0 B for zero size', () => {
    render(<MetricsBar durationMs={0} sizeBytes={0} />);
    expect(screen.getByText('0 B')).toBeInTheDocument();
  });

  it('displays Time and Size labels', () => {
    render(<MetricsBar durationMs={10} sizeBytes={10} />);
    expect(screen.getByText('Time:')).toBeInTheDocument();
    expect(screen.getByText('Size:')).toBeInTheDocument();
  });

  it('displays 1023 B (boundary below KB)', () => {
    render(<MetricsBar durationMs={0} sizeBytes={1023} />);
    expect(screen.getByText('1023 B')).toBeInTheDocument();
  });
});
