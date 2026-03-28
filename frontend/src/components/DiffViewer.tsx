import React, { useEffect, useState } from 'react';
import { HistoryEntry } from '../store/historyStore';
import { useBodyDiff } from '../hooks/useDiff';
import DiffPane from './DiffPane';
import { HeadersDiffTable } from './HeadersDiffTable';
import StatusBadge from './StatusBadge';
import './DiffViewer.css';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface DiffViewerProps {
  older: HistoryEntry;
  newer: HistoryEntry;
  onClose: () => void;
}

type Tab = 'body' | 'headers' | 'meta';
type ViewMode = 'split' | 'unified';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function parseHeaders(raw: string | undefined): Record<string, string[]> {
  try {
    const parsed = JSON.parse(raw || '{}');
    return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)
      ? (parsed as Record<string, string[]>)
      : {};
  } catch {
    return {};
  }
}

function formatTimestamp(iso: string): string {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

const HTTP_STATUS_TEXTS: Record<number, string> = {
  100: 'Continue', 101: 'Switching Protocols', 102: 'Processing',
  200: 'OK', 201: 'Created', 202: 'Accepted', 204: 'No Content',
  206: 'Partial Content',
  300: 'Multiple Choices', 301: 'Moved Permanently', 302: 'Found',
  303: 'See Other', 304: 'Not Modified', 307: 'Temporary Redirect',
  308: 'Permanent Redirect',
  400: 'Bad Request', 401: 'Unauthorized', 403: 'Forbidden',
  404: 'Not Found', 405: 'Method Not Allowed', 408: 'Request Timeout',
  409: 'Conflict', 410: 'Gone', 413: 'Payload Too Large',
  415: 'Unsupported Media Type', 422: 'Unprocessable Entity',
  429: 'Too Many Requests',
  500: 'Internal Server Error', 501: 'Not Implemented',
  502: 'Bad Gateway', 503: 'Service Unavailable', 504: 'Gateway Timeout',
};

function httpStatusText(code: number): string {
  return HTTP_STATUS_TEXTS[code] ?? 'Unknown';
}

// ---------------------------------------------------------------------------
// MetaTable inline sub-component
// ---------------------------------------------------------------------------

interface MetaTableProps {
  older: HistoryEntry;
  newer: HistoryEntry;
}

const MetaTable: React.FC<MetaTableProps> = ({ older, newer }) => {
  const olderTs = formatTimestamp(older.executed_at);
  const newerTs = formatTimestamp(newer.executed_at);

  const statusDiffers = older.response_status !== newer.response_status;
  const durationDiffers = (older.response_duration_ms ?? 0) !== (newer.response_duration_ms ?? 0);
  const sizeDiffers = (older.response_size_bytes ?? 0) !== (newer.response_size_bytes ?? 0);

  return (
    <div className="diff-viewer-meta-tab">
      <table className="diff-viewer-meta-table">
        <thead>
          <tr>
            <th>Metric</th>
            <th>{olderTs}</th>
            <th>{newerTs}</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Status Code</td>
            <td className={statusDiffers ? 'diff-viewer-meta-cell--diff' : ''}>
              <StatusBadge
                statusCode={older.response_status}
                statusText={httpStatusText(older.response_status)}
              />
            </td>
            <td className={statusDiffers ? 'diff-viewer-meta-cell--diff' : ''}>
              <StatusBadge
                statusCode={newer.response_status}
                statusText={httpStatusText(newer.response_status)}
              />
            </td>
          </tr>
          <tr>
            <td>Duration (ms)</td>
            <td className={durationDiffers ? 'diff-viewer-meta-cell--diff' : ''}>
              {(older.response_duration_ms ?? 0).toLocaleString()}
            </td>
            <td className={durationDiffers ? 'diff-viewer-meta-cell--diff' : ''}>
              {(newer.response_duration_ms ?? 0).toLocaleString()}
            </td>
          </tr>
          <tr>
            <td>Response Size (bytes)</td>
            <td className={sizeDiffers ? 'diff-viewer-meta-cell--diff' : ''}>
              {(older.response_size_bytes ?? 0).toLocaleString()}
            </td>
            <td className={sizeDiffers ? 'diff-viewer-meta-cell--diff' : ''}>
              {(newer.response_size_bytes ?? 0).toLocaleString()}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
};

// ---------------------------------------------------------------------------
// DiffViewer
// ---------------------------------------------------------------------------

const DiffViewer: React.FC<DiffViewerProps> = ({ older, newer, onClose }) => {
  const [activeTab, setActiveTab] = useState<Tab>('body');
  const [viewMode, setViewMode] = useState<ViewMode>('split');

  const { hunks, truncated } = useBodyDiff(
    older.response_body ?? '',
    newer.response_body ?? '',
  );

  const olderHeaders = parseHeaders(older.response_headers);
  const newerHeaders = parseHeaders(newer.response_headers);

  // Escape key handler
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [onClose]);

  return (
    <div className="diff-viewer-overlay" role="dialog" aria-modal="true" aria-label="Diff viewer">
      {/* Backdrop */}
      <div className="diff-viewer-backdrop" onClick={onClose} />

      {/* Modal box */}
      <div className="diff-viewer-box" onClick={(e) => e.stopPropagation()}>
        {/* Header / tab bar */}
        <div className="diff-viewer-header">
          <div className="diff-viewer-tabs" role="tablist">
            <button
              role="tab"
              aria-selected={activeTab === 'body'}
              className={`diff-viewer-tab${activeTab === 'body' ? ' diff-viewer-tab--active' : ''}`}
              onClick={() => setActiveTab('body')}
            >
              Body Diff
            </button>
            <button
              role="tab"
              aria-selected={activeTab === 'headers'}
              className={`diff-viewer-tab${activeTab === 'headers' ? ' diff-viewer-tab--active' : ''}`}
              onClick={() => setActiveTab('headers')}
            >
              Headers Diff
            </button>
            <button
              role="tab"
              aria-selected={activeTab === 'meta'}
              className={`diff-viewer-tab${activeTab === 'meta' ? ' diff-viewer-tab--active' : ''}`}
              onClick={() => setActiveTab('meta')}
            >
              Meta
            </button>
          </div>
          <button
            className="diff-viewer-close"
            onClick={onClose}
            aria-label="Close diff viewer"
          >
            ×
          </button>
        </div>

        {/* Tab content */}
        <div className="diff-viewer-body">
          {activeTab === 'body' && (
            <>
              {truncated && (
                <div className="diff-viewer-truncation-warning" role="alert">
                  Response body truncated to 500 KB for diffing.
                </div>
              )}

              {/* Split / Unified toolbar */}
              <div className="diff-viewer-toolbar">
                <div className="diff-viewer-view-toggle" role="group" aria-label="View mode">
                  <button
                    className={`diff-viewer-view-toggle__btn${viewMode === 'split' ? ' diff-viewer-view-toggle__btn--active' : ''}`}
                    onClick={() => setViewMode('split')}
                    aria-pressed={viewMode === 'split'}
                  >
                    Split
                  </button>
                  <button
                    className={`diff-viewer-view-toggle__btn${viewMode === 'unified' ? ' diff-viewer-view-toggle__btn--active' : ''}`}
                    onClick={() => setViewMode('unified')}
                    aria-pressed={viewMode === 'unified'}
                  >
                    Unified
                  </button>
                </div>
              </div>

              {/* Diff panels */}
              <div
                className={`diff-viewer-panels diff-viewer-panels--${viewMode}`}
                role="tabpanel"
              >
                {viewMode === 'split' ? (
                  <>
                    <div className="diff-viewer-panel">
                      <DiffPane hunks={hunks} view="split" side="left" />
                    </div>
                    <div className="diff-viewer-panel">
                      <DiffPane hunks={hunks} view="split" side="right" />
                    </div>
                  </>
                ) : (
                  <div className="diff-viewer-panel">
                    <DiffPane hunks={hunks} view="unified" />
                  </div>
                )}
              </div>
            </>
          )}

          {activeTab === 'headers' && (
            <div className="diff-viewer-headers-tab" role="tabpanel">
              <HeadersDiffTable older={olderHeaders} newer={newerHeaders} />
            </div>
          )}

          {activeTab === 'meta' && (
            <MetaTable older={older} newer={newer} />
          )}
        </div>
      </div>
    </div>
  );
};

export default DiffViewer;
