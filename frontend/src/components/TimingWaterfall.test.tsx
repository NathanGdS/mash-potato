import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import TimingWaterfall, { buildPhaseRows } from './TimingWaterfall';
import { db } from '../../wailsjs/go/models';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeTiming(overrides: Partial<db.TimingPhases> = {}): db.TimingPhases {
  return db.TimingPhases.createFrom({
    dns_lookup: 10,
    tcp_handshake: 20,
    tls_handshake: 30,
    ttfb: 100,
    download: 50,
    ...overrides,
  });
}

/** Full HTTPS: all phases non-zero */
const fullHttpsTiming = makeTiming();

/** HTTP (no TLS): tls_handshake === 0 */
const httpTiming = makeTiming({ tls_handshake: 0 });

/** Connection reused: dns_lookup === 0, tcp_handshake === 0 */
const reusedTiming = makeTiming({ dns_lookup: 0, tcp_handshake: 0 });

/** All zeros: no timing data */
const zeroTiming = makeTiming({ dns_lookup: 0, tcp_handshake: 0, tls_handshake: 0, ttfb: 0, download: 0 });

// ---------------------------------------------------------------------------
// buildPhaseRows unit tests
// ---------------------------------------------------------------------------

describe('buildPhaseRows', () => {
  it('returns 5 rows for full HTTPS timing (all non-zero)', () => {
    const rows = buildPhaseRows(fullHttpsTiming);
    expect(rows).toHaveLength(5);
  });

  it('returns 4 rows when tls_handshake === 0 (HTTP, no TLS)', () => {
    const rows = buildPhaseRows(httpTiming);
    expect(rows).toHaveLength(4);
  });

  it('omits TLS row when tls_handshake === 0', () => {
    const rows = buildPhaseRows(httpTiming);
    const labels = rows.map((r) => r.label);
    expect(labels).not.toContain('TLS Handshake');
  });

  it('includes TLS row when tls_handshake > 0', () => {
    const rows = buildPhaseRows(fullHttpsTiming);
    const labels = rows.map((r) => r.label);
    expect(labels).toContain('TLS Handshake');
  });

  it('computes offsetMs as cumulative sum of preceding durationMs', () => {
    const rows = buildPhaseRows(fullHttpsTiming);
    // DNS Lookup: offset 0
    expect(rows[0].label).toBe('DNS Lookup');
    expect(rows[0].offsetMs).toBe(0);
    // TCP Handshake: offset = dns_lookup (10)
    expect(rows[1].label).toBe('TCP Handshake');
    expect(rows[1].offsetMs).toBe(10);
    // TLS Handshake: offset = dns + tcp (10 + 20 = 30)
    expect(rows[2].label).toBe('TLS Handshake');
    expect(rows[2].offsetMs).toBe(30);
    // TTFB: offset = dns + tcp + tls (10 + 20 + 30 = 60)
    expect(rows[3].label).toBe('TTFB');
    expect(rows[3].offsetMs).toBe(60);
    // Download: offset = dns + tcp + tls + ttfb (10 + 20 + 30 + 100 = 160)
    expect(rows[4].label).toBe('Download');
    expect(rows[4].offsetMs).toBe(160);
  });

  it('computes correct offsets for HTTP timing (no TLS row)', () => {
    const rows = buildPhaseRows(httpTiming);
    // DNS Lookup: 0
    expect(rows[0].offsetMs).toBe(0);
    // TCP Handshake: 10
    expect(rows[1].offsetMs).toBe(10);
    // TTFB (no TLS): 10 + 20 = 30
    expect(rows[2].label).toBe('TTFB');
    expect(rows[2].offsetMs).toBe(30);
    // Download: 30 + 100 = 130
    expect(rows[3].label).toBe('Download');
    expect(rows[3].offsetMs).toBe(130);
  });

  it('each row durationMs matches input timing field', () => {
    const rows = buildPhaseRows(fullHttpsTiming);
    expect(rows.find((r) => r.label === 'DNS Lookup')?.durationMs).toBe(10);
    expect(rows.find((r) => r.label === 'TCP Handshake')?.durationMs).toBe(20);
    expect(rows.find((r) => r.label === 'TLS Handshake')?.durationMs).toBe(30);
    expect(rows.find((r) => r.label === 'TTFB')?.durationMs).toBe(100);
    expect(rows.find((r) => r.label === 'Download')?.durationMs).toBe(50);
  });

  it('returns length 5 for full HTTPS and length 4 for HTTP', () => {
    expect(buildPhaseRows(fullHttpsTiming)).toHaveLength(5);
    expect(buildPhaseRows(httpTiming)).toHaveLength(4);
  });
});

// ---------------------------------------------------------------------------
// TimingWaterfall render tests
// ---------------------------------------------------------------------------

describe('TimingWaterfall', () => {
  it('renders "No timing data available" when all phases are 0', () => {
    render(<TimingWaterfall timing={zeroTiming} />);
    expect(screen.getByText('No timing data available')).toBeInTheDocument();
  });

  it('does NOT render "No timing data available" when there is data', () => {
    render(<TimingWaterfall timing={fullHttpsTiming} />);
    expect(screen.queryByText('No timing data available')).not.toBeInTheDocument();
  });

  it('renders "Connection reused" note when dns_lookup === 0 and tcp_handshake === 0', () => {
    render(<TimingWaterfall timing={reusedTiming} />);
    expect(screen.getByText('Connection reused')).toBeInTheDocument();
  });

  it('does NOT render "Connection reused" note when dns_lookup > 0', () => {
    render(<TimingWaterfall timing={fullHttpsTiming} />);
    expect(screen.queryByText('Connection reused')).not.toBeInTheDocument();
  });

  it('does NOT render "Connection reused" when only tcp_handshake is 0 but dns_lookup > 0', () => {
    const timing = makeTiming({ tcp_handshake: 0 });
    render(<TimingWaterfall timing={timing} />);
    expect(screen.queryByText('Connection reused')).not.toBeInTheDocument();
  });

  it('each bar has aria-label containing phase name and duration', () => {
    render(<TimingWaterfall timing={fullHttpsTiming} />);
    expect(screen.getByLabelText('DNS Lookup: 10ms')).toBeInTheDocument();
    expect(screen.getByLabelText('TCP Handshake: 20ms')).toBeInTheDocument();
    expect(screen.getByLabelText('TLS Handshake: 30ms')).toBeInTheDocument();
    expect(screen.getByLabelText('TTFB: 100ms')).toBeInTheDocument();
    expect(screen.getByLabelText('Download: 50ms')).toBeInTheDocument();
  });

  it('TLS bar absent when tls_handshake === 0', () => {
    render(<TimingWaterfall timing={httpTiming} />);
    expect(screen.queryByLabelText(/TLS Handshake/)).not.toBeInTheDocument();
  });

  it('tooltip title attribute includes offset and duration for DNS row', () => {
    const { container } = render(<TimingWaterfall timing={fullHttpsTiming} />);
    const dnsBar = container.querySelector('[aria-label="DNS Lookup: 10ms"]');
    expect(dnsBar).not.toBeNull();
    expect(dnsBar?.getAttribute('title')).toContain('0ms');   // offset
    expect(dnsBar?.getAttribute('title')).toContain('10ms');  // duration
  });

  it('tooltip title attribute includes correct offset for TTFB row', () => {
    const { container } = render(<TimingWaterfall timing={fullHttpsTiming} />);
    const ttfbBar = container.querySelector('[aria-label="TTFB: 100ms"]');
    expect(ttfbBar?.getAttribute('title')).toContain('60ms');   // offset = 10+20+30
    expect(ttfbBar?.getAttribute('title')).toContain('100ms');  // duration
  });

  it('total row shows correct sum for full HTTPS timing', () => {
    render(<TimingWaterfall timing={fullHttpsTiming} />);
    // total = 10 + 20 + 30 + 100 + 50 = 210
    expect(screen.getByText('210ms')).toBeInTheDocument();
  });

  it('total row shows correct sum for HTTP timing (no TLS)', () => {
    render(<TimingWaterfall timing={httpTiming} />);
    // total = 10 + 20 + 100 + 50 = 180
    expect(screen.getByText('180ms')).toBeInTheDocument();
  });

  it('total row shows correct sum for connection-reused timing', () => {
    render(<TimingWaterfall timing={reusedTiming} />);
    // total = 0 + 0 + 30 + 100 + 50 = 180
    expect(screen.getByText('180ms')).toBeInTheDocument();
  });

  it('renders a row for each phase in full HTTPS timing', () => {
    const { container } = render(<TimingWaterfall timing={fullHttpsTiming} />);
    const bars = container.querySelectorAll('[aria-label]');
    // 5 phase bars
    expect(bars).toHaveLength(5);
  });

  it('renders a row for each phase in HTTP timing (4 bars, no TLS)', () => {
    const { container } = render(<TimingWaterfall timing={httpTiming} />);
    const bars = container.querySelectorAll('[aria-label]');
    expect(bars).toHaveLength(4);
  });
});
