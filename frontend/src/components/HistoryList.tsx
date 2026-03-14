import React, { useEffect } from 'react';
import { useHistoryStore, HistoryEntry } from '../store/historyStore';
import { useRequestsStore } from '../store/requestsStore';
import { useTabsStore } from '../store/tabsStore';
import './HistoryList.css';

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

const HistoryList: React.FC = () => {
  const { entries, loading, error, fetchHistory, clearHistory } = useHistoryStore();
  const { setActiveRequest } = useRequestsStore();
  const { setActiveTab } = useTabsStore();

  useEffect(() => {
    fetchHistory();
  }, [fetchHistory]);

  function loadEntry(entry: HistoryEntry) {
    // History entries are ephemeral and don't have tabs; focus no tab.
    setActiveTab(null);
    // Build an ephemeral Request object (no collection_id, no persisted id).
    setActiveRequest({
      id: `__history__${entry.id}`,
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

      {loading && <p className="history-status">Loading…</p>}
      {!loading && error && <p className="history-status history-status--error">{error}</p>}
      {!loading && !error && entries.length === 0 && (
        <p className="history-status history-status--empty">No history yet.</p>
      )}

      <ul className="history-entries">
        {entries.map((entry) => (
          <li
            key={entry.id}
            className="history-entry"
            onClick={() => loadEntry(entry)}
            title={entry.url}
          >
            <span className={`request-method ${methodClass(entry.method)}`}>
              {entry.method}
            </span>
            <span className="history-entry-url">{truncateUrl(entry.url)}</span>
            <span className={`history-entry-status ${statusClass(entry.response_status)}`}>
              {entry.response_status > 0 ? entry.response_status : '—'}
            </span>
            <span className="history-entry-time">{formatTime(entry.executed_at)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
};

export default HistoryList;
