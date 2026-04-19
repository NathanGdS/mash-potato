import React from 'react';
import { db } from '../../wailsjs/go/models';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PhaseRow {
  label: string;
  color: string;
  durationMs: number;
  offsetMs: number;
}

interface TimingWaterfallProps {
  timing: db.TimingPhases;
}

// ---------------------------------------------------------------------------
// buildPhaseRows — named export so tests can import it directly
// ---------------------------------------------------------------------------

export function buildPhaseRows(timing: db.TimingPhases): PhaseRow[] {
  const candidates: Array<{ label: string; color: string; durationMs: number; tls?: true }> = [
    { label: 'DNS Lookup',     color: 'var(--timing-dns)',  durationMs: timing.dns_lookup    },
    { label: 'TCP Handshake',  color: 'var(--timing-tcp)',  durationMs: timing.tcp_handshake },
    { label: 'TLS Handshake',  color: 'var(--timing-tls)',  durationMs: timing.tls_handshake, tls: true },
    { label: 'TTFB',           color: 'var(--timing-ttfb)', durationMs: timing.ttfb          },
    { label: 'Download',       color: 'var(--timing-dl)',   durationMs: timing.download      },
  ];

  const rows: PhaseRow[] = [];
  let offset = 0;

  for (const candidate of candidates) {
    // Omit TLS row when tls_handshake === 0
    if (candidate.tls && timing.tls_handshake === 0) continue;

    rows.push({
      label: candidate.label,
      color: candidate.color,
      durationMs: candidate.durationMs,
      offsetMs: offset,
    });

    offset += candidate.durationMs;
  }

  return rows;
}

// ---------------------------------------------------------------------------
// TimingWaterfall component
// ---------------------------------------------------------------------------

const TimingWaterfall: React.FC<TimingWaterfallProps> = ({ timing }) => {
  const rows = buildPhaseRows(timing);
  const totalMs = rows.reduce((sum, r) => sum + r.durationMs, 0);
  const connectionReused = timing.dns_lookup === 0 && timing.tcp_handshake === 0;
  const hasData = totalMs > 0;

  if (!hasData) {
    return (
      <div className="timing-waterfall">
        <p>No timing data available</p>
      </div>
    );
  }

  return (
    <div className="timing-waterfall">
      <table className="timing-waterfall__table">
        <tbody>
          {rows.map((row) => {
            const widthPct = totalMs > 0 ? (row.durationMs / totalMs) * 100 : 0;
            const tooltip = `${row.label}: starts at ${row.offsetMs}ms, duration ${row.durationMs}ms`;

            return (
              <tr key={row.label} className="timing-waterfall__row">
                <td className="timing-waterfall__label">
                  <span className="timing-waterfall__dot" style={{ background: row.color }} />
                  {row.label}
                </td>
                <td className="timing-waterfall__bar-cell">
                  {widthPct > 0 && (
                    <div
                      className="timing-bar"
                      style={{ width: `${widthPct}%`, backgroundColor: row.color }}
                      aria-label={`${row.label}: ${row.durationMs}ms`}
                      title={tooltip}
                    />
                  )}
                </td>
                <td className="timing-waterfall__duration">
                  {row.durationMs}ms
                </td>
              </tr>
            );
          })}

          <tr className="timing-waterfall__row timing-waterfall__row--total">
            <td className="timing-waterfall__label timing-waterfall__label--total">
              Total
              {connectionReused && (
                <span className="timing-waterfall__reused-badge">Connection reused</span>
              )}
            </td>
            <td className="timing-waterfall__bar-cell" />
            <td className="timing-waterfall__duration timing-waterfall__duration--total">
              {totalMs}ms
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
};

export default TimingWaterfall;
