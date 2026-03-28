import React, { useEffect } from 'react';
import { useHistoryStore, HistoryEntry } from '../store/historyStore';
import { useRequestsStore } from '../store/requestsStore';
import { useTabsStore } from '../store/tabsStore';
import { useResponseStore } from '../store/responseStore';
import './HistoryList.css';

interface HistoryListProps {
  onCompare: () => void;
}

function methodClass(method: string): string {
  const m = method.toLowerCase();
  if (['get', 'post', 'put', 'patch', 'delete'].includes(m)) return `request-method--${m}`;
  return 'request-method--other';
}

function statusClass(status: number): string {
  if (status >= 500) return 'history-status--5xx';
  if (status >= 400) return 'history-status--4xx';
  if (status >= 300) return 'history-status--3xx';
  if (status >= 200) return 'history-status--2xx';
  return 'history-status--other';
}

function formatTime(isoStr: string): string {
  try {
    const d = new Date(isoStr);
    return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  } catch {
    return isoStr;
  }
}

function truncateUrl(url: string, maxLen = 40): string {
  if (url.length <= maxLen) return url;
  return url.slice(0, maxLen) + '…';
}

const HistoryList: React.FC<HistoryListProps> = ({ onCompare }) => {
  const { entries, loading, error, fetchHistory, clearHistory, diffSelection, toggleDiffSelection } = useHistoryStore();
  const { setActiveRequest } = useRequestsStore();
  const { setActiveTab } = useTabsStore();
  const { setResponse, setActiveRequestId } = useResponseStore();

  useEffect(() => {
    fetchHistory();
  }, [fetchHistory]);

  function loadEntry(entry: HistoryEntry) {
    const historyId = `__history__${entry.id}`;

    // Reconstruct the stored response into the response panel.
    let parsedHeaders: Record<string, string[]> = {};
    try { parsedHeaders = JSON.parse(entry.response_headers || '{}'); } catch { /* ignore */ }
    setResponse(historyId, {
      StatusCode: entry.response_status,
      StatusText: String(entry.response_status),
      Body: entry.response_body || '',
      Headers: parsedHeaders,
      DurationMs: entry.response_duration_ms || 0,
      SizeBytes: entry.response_size_bytes || 0,
      consoleLogs: [],
      scriptErrors: [],
    });

    // History entries are ephemeral and don't have tabs; focus no tab.
    setActiveTab(null);
    // Restore the active request ID after setActiveTab clears it.
    setActiveRequestId(historyId);

    // Build an ephemeral Request object (no collection_id, no persisted id).
    setActiveRequest({
      id: historyId,
      collection_id: '',
      folder_id: null,
      name: `${entry.method} ${entry.url}`,
      method: entry.method,
      url: entry.url,
      headers: entry.headers,
      params: entry.params,
      body_type: entry.body_type,
      body: entry.body,
      auth_type: 'none',
      auth_config: '{}',
      timeout_seconds: 30,
      tests: '',
      pre_script: '',
      post_script: '',
      created_at: entry.executed_at,
    });
  }

  async function handleClear() {
    await clearHistory();
  }

  return (
    <div className="history-list-container">
      <div className="history-list-header">
        <span className="history-list-title">History</span>
        <div className="history-header-actions">
          {diffSelection.length === 2 && (
            <button
              className="history-compare-btn"
              onClick={onCompare}
              title="Compare selected entries"
            >
              Compare selected
            </button>
          )}
          {entries.length > 0 && (
            <button
              className="history-clear-btn"
              onClick={handleClear}
              title="Clear history"
            >
              Clear
            </button>
          )}
        </div>
      </div>

      {loading && <p className="history-status">Loading…</p>}
      {!loading && error && <p className="history-status history-status--error">{error}</p>}
      {!loading && !error && entries.length === 0 && (
        <p className="history-status history-status--empty">No history yet.</p>
      )}

      <ul className="history-entries">
        {entries.map((entry) => {
          const isChecked = diffSelection.some((e) => e.id === entry.id);
          const showCheckbox = true;
          return (
            <li
              key={entry.id}
              className="history-entry"
              onClick={() => loadEntry(entry)}
              title={entry.url}
            >
              {showCheckbox && (
                <input
                  type="checkbox"
                  className="history-entry-checkbox"
                  checked={isChecked}
                  onChange={() => {/* controlled via onClick */}}
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleDiffSelection(entry);
                  }}
                />
              )}
              <span className={`request-method ${methodClass(entry.method)}`}>
                {entry.method}
              </span>
              <span className="history-entry-url">{truncateUrl(entry.url)}</span>
              <span className={`history-entry-status ${statusClass(entry.response_status)}`}>
                {entry.response_status > 0 ? entry.response_status : '—'}
              </span>
              <span className="history-entry-time">{formatTime(entry.executed_at)}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
};

export default HistoryList;
