import { useState } from 'react';
import { useHeadersDiff, HeaderDiffRow } from '../hooks/useDiff';
import './HeadersDiffTable.css';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface HeadersDiffTableProps {
  older: Record<string, string[]>;
  newer: Record<string, string[]>;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function rowClassName(status: HeaderDiffRow['status']): string {
  return `headers-diff-row headers-diff-row--${status}`;
}

/** Join multi-value header arrays with newline for display. */
function formatValue(value: string | null): string {
  return value ?? '';
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function HeadersDiffTable({ older, newer }: HeadersDiffTableProps) {
  const [showUnchanged, setShowUnchanged] = useState(false);

  const rows = useHeadersDiff(older, newer);

  const added     = rows.filter(r => r.status === 'added');
  const removed   = rows.filter(r => r.status === 'removed');
  const changed   = rows.filter(r => r.status === 'changed');
  const unchanged = rows.filter(r => r.status === 'unchanged');

  const visibleRows: HeaderDiffRow[] = [
    ...added,
    ...removed,
    ...changed,
    ...(showUnchanged ? unchanged : []),
  ];

  return (
    <div>
      <table className="headers-diff-table">
        <colgroup>
          <col className="col-key" />
          <col className="col-old" />
          <col className="col-new" />
        </colgroup>
        <thead>
          <tr>
            <th>Header</th>
            <th>Old value</th>
            <th>New value</th>
          </tr>
        </thead>
        <tbody>
          {visibleRows.map(row => (
            <tr key={row.key} className={rowClassName(row.status)}>
              <td className="cell-key">{row.key}</td>
              <td
                className={
                  row.oldValue == null
                    ? 'cell-value cell-value--empty'
                    : 'cell-value'
                }
              >
                {formatValue(row.oldValue)}
              </td>
              <td
                className={
                  row.newValue == null
                    ? 'cell-value cell-value--empty'
                    : 'cell-value'
                }
              >
                {formatValue(row.newValue)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {unchanged.length > 0 && (
        <button
          className="headers-diff-toggle"
          onClick={() => setShowUnchanged(prev => !prev)}
        >
          {showUnchanged
            ? `Hide unchanged (${unchanged.length})`
            : `Show unchanged (${unchanged.length})`}
        </button>
      )}
    </div>
  );
}
