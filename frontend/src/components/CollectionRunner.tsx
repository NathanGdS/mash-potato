import React, { useEffect, useState } from 'react';
import ReactDOM from 'react-dom';
import { useRunnerStore, RunnerScope } from '../store/runnerStore';
import { RunCollection, CancelRun, ExportRunReport, RunCollectionResult } from '../wailsjs/go/main/App';
import { EventsOn, EventsOff } from '../wailsjs/runtime/runtime';
import { JsonHighlighted, tryPrettyPrint } from '../utils/jsonHighlighter';
import './CollectionRunner.css';

// ── Types ──────────────────────────────────────────────────

type RowStatus = 'pending' | 'running' | 'pass' | 'testFailed' | 'fail';

interface AssertionResult {
  expression: string;
  passed: boolean;
  message: string;
}

interface RunRow {
  id: string;
  name: string;
  method: string;
  enabled: boolean;
  status: RowStatus;
  durationMs: number;
  errorMsg: string;
  responseBody: string;
  responseHeaders: Record<string, string[]>;
  statusCode: number;
  testResults: AssertionResult[];
  retryInput: number;
  retryConsumed: number;
  skippedByFlow: boolean;
}

interface RunResultEvent {
  RequestId: string;
  RequestName: string;
  Status: number;
  DurationMs: number;
  Passed: boolean;
  TestsPassed: boolean;
  Error: string;
  ResponseBody: string;
  ResponseHeaders: Record<string, string[]>;
  TestResults: AssertionResult[];
  RetryCount: number;
  SkippedByFlow: boolean;
  JumpedTo: string;
}

type RunState = 'idle' | 'running' | 'done' | 'stopped';
type TerminalState = '' | 'completed' | 'cancelled' | 'stopped_by_script' | 'stopped_by_loop_limit';

// ── Helpers ────────────────────────────────────────────────

function methodBadgeClass(method: string): string {
  switch (method.toUpperCase()) {
    case 'GET':    return 'request-method request-method--get';
    case 'POST':   return 'request-method request-method--post';
    case 'PUT':    return 'request-method request-method--put';
    case 'PATCH':  return 'request-method request-method--patch';
    case 'DELETE': return 'request-method request-method--delete';
    default:       return 'request-method request-method--other';
  }
}

function StatusDot({ status }: { status: RowStatus }) {
  return <span className={`runner-status-dot runner-status-dot--${status}`} aria-label={status} />;
}

// ── FlowDiagram ────────────────────────────────────────────

const NODE_H = 36;

interface FlowDiagramProps {
  rows: RunRow[];
  jumps: Array<{ fromName: string; toName: string }>;
}

function nodeStateClass(row: RunRow): string {
  if (row.skippedByFlow) return 'flow-node--skipped';
  return `flow-node--${row.status}`;
}

const FlowDiagram: React.FC<FlowDiagramProps> = ({ rows, jumps }) => {
  const enabled = rows.filter((r) => r.enabled);
  if (enabled.length === 0) return null;

  const totalH = enabled.length * NODE_H;

  return (
    <div className="flow-diagram">
      <div className="flow-diagram-nodes">
        {enabled.map((row) => (
          <div key={row.id} className={`flow-node ${nodeStateClass(row)}`} style={{ height: NODE_H }}>
            <span className="flow-node-dot" />
            <span className="flow-node-name">{row.name}</span>
          </div>
        ))}
      </div>

      {jumps.length > 0 && (
        <svg className="flow-arrows" width={48} height={totalH} aria-hidden="true">
          {jumps.map((jump, idx) => {
            const fromIdx = enabled.findIndex((r) => r.name === jump.fromName);
            const toIdx = enabled.findIndex((r) => r.name === jump.toName);
            if (fromIdx < 0 || toIdx < 0) return null;
            const y1 = fromIdx * NODE_H + NODE_H / 2;
            const y2 = toIdx * NODE_H + NODE_H / 2;
            const cx = 36;
            // Curved bezier — bulges to the right.
            const d = `M 0 ${y1} C ${cx} ${y1}, ${cx} ${y2}, 0 ${y2}`;
            return (
              <g key={idx}>
                <path d={d} className="flow-arrow-path" markerEnd="url(#arrow)" />
              </g>
            );
          })}
          <defs>
            <marker id="arrow" markerWidth="6" markerHeight="6" refX="3" refY="3" orient="auto">
              <path d="M0,0 L0,6 L6,3 z" className="flow-arrow-head" />
            </marker>
          </defs>
        </svg>
      )}
    </div>
  );
};

// ── Component ──────────────────────────────────────────────

interface Props {
  scope: RunnerScope;
  onClose: () => void;
}

const CollectionRunner: React.FC<Props> = ({ scope, onClose }) => {
  // Derive initial rows from scope
  const [rows, setRows] = useState<RunRow[]>(() =>
    scope.requests.map((r) => ({
      id: r.id,
      name: r.name,
      method: r.method,
      enabled: true,
      status: 'pending',
      durationMs: 0,
      errorMsg: '',
      responseBody: '',
      responseHeaders: {},
      statusCode: 0,
      testResults: [],
      retryInput: 0,
      retryConsumed: 0,
      skippedByFlow: false,
    }))
  );
  const [terminalState, setTerminalState] = useState<TerminalState>('');
  const [jumps, setJumps] = useState<Array<{ fromName: string; toName: string }>>([]);
  const [lastRunResult, setLastRunResult] = useState<RunCollectionResult | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [responseModalRow, setResponseModalRow] = useState<RunRow | null>(null);

  const [delayMs, setDelayMs] = useState(0);
  const [delayRaw, setDelayRaw] = useState('0');
  const [delayError, setDelayError] = useState('');
  const [runState, setRunState] = useState<RunState>('idle');

  // ── Event listener for live results ─────────────────────
  useEffect(() => {
    const handler = (result: RunResultEvent) => {
      let status: RowStatus;
      if (result.SkippedByFlow) {
        status = 'pending';
      } else if (!result.Passed) {
        status = 'fail';
      } else if (result.TestResults?.some((t) => !t.passed)) {
        status = 'testFailed';
      } else {
        status = 'pass';
      }

      setRows((prev) => {
        const completedIdx = prev.findIndex((r) => r.id === result.RequestId);
        return prev.map((row, i) => {
          if (row.id === result.RequestId) {
            return {
              ...row,
              status,
              durationMs: result.DurationMs,
              errorMsg: result.Error ?? '',
              responseBody: result.ResponseBody ?? '',
              responseHeaders: result.ResponseHeaders ?? {},
              statusCode: result.Status,
              testResults: result.TestResults ?? [],
              retryConsumed: result.RetryCount ?? 0,
              skippedByFlow: result.SkippedByFlow ?? false,
            };
          }
          // Mark next request as running for active-node highlight.
          if (result.JumpedTo) {
            if (row.name === result.JumpedTo) return { ...row, status: 'running' };
          } else if (!result.SkippedByFlow && i === completedIdx + 1 && row.enabled && row.status === 'pending') {
            return { ...row, status: 'running' };
          }
          return row;
        });
      });

      // Record jump for flow diagram arrows.
      if (result.JumpedTo) {
        setJumps((prev) => [...prev, { fromName: result.RequestName, toName: result.JumpedTo }]);
      }
    };

    EventsOn('runner:result', handler);
    return () => {
      EventsOff('runner:result');
    };
  }, []);

  // ── Derived values ────────────────────────────────────────
  const enabledRows = rows.filter((r) => r.enabled);
  const enabledIDs = enabledRows.map((r) => r.id);
  const isRunning = runState === 'running';

  const passCount = rows.filter((r) => r.status === 'pass').length;
  const failCount = rows.filter((r) => r.status === 'fail').length;
  const testFailCount = rows.filter((r) => r.status === 'testFailed').length;
  const totalDuration = rows.reduce((sum, r) => sum + r.durationMs, 0);
  const showSummary = runState === 'done' || runState === 'stopped';

  // ── Handlers ──────────────────────────────────────────────
  const handleBackdropClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget && !isRunning) onClose();
  };

  const handleBackdropKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape' && !isRunning) onClose();
  };

  const handleToggleRow = (id: string) => {
    if (isRunning) return;
    setRows((prev) =>
      prev.map((r) => (r.id === id ? { ...r, enabled: !r.enabled } : r))
    );
  };

  const handleDelayChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value;
    setDelayRaw(raw);
    const n = parseInt(raw, 10);
    if (raw === '' || isNaN(n) || n < 0) {
      setDelayError('Enter a whole number ≥ 0');
      setDelayMs(0);
    } else {
      setDelayError('');
      setDelayMs(n);
    }
  };

  const handleStart = async () => {
    if (enabledIDs.length === 0 || isRunning || delayError) return;

    // Reset row statuses
    setExpandedId(null);
    setTerminalState('');
    setJumps([]);
    setLastRunResult(null);
    setRows((prev) =>
      prev.map((r) => ({
        ...r,
        status: 'pending',
        durationMs: 0,
        errorMsg: '',
        responseBody: '',
        responseHeaders: {},
        statusCode: 0,
        testResults: [],
        retryConsumed: 0,
        skippedByFlow: false,
      }))
    );

    setRunState('running');

    // Pre-mark first enabled row as running for immediate feedback.
    setRows((prev) => {
      const firstEnabled = prev.find((r) => r.enabled);
      if (!firstEnabled) return prev;
      return prev.map((r) => (r.id === firstEnabled.id ? { ...r, status: 'running' } : r));
    });

    // Build retryMap from per-row inputs.
    const retryMap: Record<string, number> = {};
    rows.forEach((r) => {
      if (r.enabled && r.retryInput > 0) retryMap[r.id] = r.retryInput;
    });

    try {
      const runResult = await RunCollection(scope.collectionId, enabledIDs, delayMs, retryMap);
      setTerminalState((runResult?.TerminalState as TerminalState) ?? 'completed');
      setLastRunResult(runResult ?? null);
    } catch {
      // errors are captured per-row via events; just finish the run
    } finally {
      setRunState((prev) => (prev === 'running' ? 'done' : prev));
    }
  };

  const handleStop = async () => {
    await CancelRun();
    setRunState('stopped');
  };

  const handleClose = () => {
    if (!isRunning) onClose();
  };

  const handleExport = async () => {
    if (!lastRunResult) return;
    try {
      const json = await ExportRunReport(lastRunResult);
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'run-report.json';
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      // silent — non-critical export failure
    }
  };

  const handleToggleExpand = (id: string, status: RowStatus) => {
    if (status !== 'pass' && status !== 'fail' && status !== 'testFailed') return;
    setExpandedId((prev) => (prev === id ? null : id));
  };

  // ── Render ────────────────────────────────────────────────
  const runnerPortal = ReactDOM.createPortal(
    <div
      className="modal-backdrop"
      onClick={handleBackdropClick}
      onKeyDown={handleBackdropKeyDown}
      role="dialog"
      aria-modal="true"
      aria-label={`Run: ${scope.scopeName}`}
    >
      <div className="runner-modal">
        {/* Header */}
        <div className="runner-modal-header">
          <span className="runner-modal-title">Run: {scope.scopeName}</span>
          <button
            className="runner-modal-close"
            onClick={handleClose}
            disabled={isRunning}
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        {/* Config bar */}
        <div className="runner-config-bar">
          <label className="runner-delay-label" htmlFor="runner-delay-input">
            Delay (ms)
          </label>
          <input
            id="runner-delay-input"
            className={`runner-delay-input${delayError ? ' runner-delay-input--error' : ''}`}
            type="number"
            min={0}
            step={1}
            value={delayRaw}
            onChange={handleDelayChange}
            disabled={isRunning}
          />
          {delayError && (
            <span className="runner-delay-error">{delayError}</span>
          )}
        </div>

        {/* Flow diagram */}
        {rows.some((r) => r.enabled) && (
          <div className="runner-flow-section">
            <FlowDiagram rows={rows} jumps={jumps} />
          </div>
        )}

        {/* Request list */}
        <div className="runner-modal-body">
          {rows.length === 0 ? (
            <p className="runner-empty">No requests in this scope.</p>
          ) : enabledIDs.length === 0 && runState === 'idle' ? (
            <p className="runner-empty">No requests selected.</p>
          ) : (
            <ul className="runner-request-list">
              {rows.map((row) => {
                const isExpandable = row.status === 'pass' || row.status === 'fail' || row.status === 'testFailed';
                const isExpanded = expandedId === row.id;
                return (
                  <li key={row.id} className="runner-request-item">
                    <div
                      className={`runner-request-row${!row.enabled ? ' runner-request-row--disabled' : ''}${isExpandable ? ' runner-request-row--clickable' : ''}`}
                      onClick={() => handleToggleExpand(row.id, row.status)}
                    >
                      <input
                        type="checkbox"
                        className="runner-checkbox"
                        checked={row.enabled}
                        onChange={() => handleToggleRow(row.id)}
                        onClick={(e) => e.stopPropagation()}
                        disabled={isRunning}
                        aria-label={`Include ${row.name}`}
                      />
                      <StatusDot status={row.status} />
                      <span
                        className={methodBadgeClass(row.method)}
                        data-method={row.method}
                      >
                        {row.method}
                      </span>
                      <span className="runner-request-name">{row.name}</span>
                      {row.status === 'pass' && (
                        <span className="runner-row-meta runner-row-meta--pass">
                          {row.statusCode} · {row.durationMs}ms
                        </span>
                      )}
                      {row.status === 'testFailed' && (
                        <span className="runner-row-meta runner-row-meta--test-failed">
                          {row.statusCode} · {row.testResults.filter((t) => !t.passed).length} test{row.testResults.filter((t) => !t.passed).length !== 1 ? 's' : ''} failed
                        </span>
                      )}
                      {row.status === 'fail' && (
                        <span className="runner-row-meta runner-row-meta--fail" title={row.errorMsg}>
                          {row.statusCode > 0 ? `${row.statusCode} · ` : ''}{row.errorMsg || 'failed'}
                        </span>
                      )}
                      {row.retryConsumed > 0 && (
                        <span className="runner-retry-badge" title={`Retried ${row.retryConsumed} time(s)`}>
                          ×{row.retryConsumed} retried
                        </span>
                      )}
                      <input
                        type="number"
                        className="runner-retry-input"
                        min={0}
                        value={row.retryInput}
                        disabled={isRunning}
                        title="Max retries for this request"
                        aria-label={`Retry count for ${row.name}`}
                        onClick={(e) => e.stopPropagation()}
                        onChange={(e) => {
                          const val = parseInt(e.target.value, 10);
                          setRows((prev) =>
                            prev.map((r) =>
                              r.id === row.id ? { ...r, retryInput: isNaN(val) || val < 0 ? 0 : val } : r
                            )
                          );
                        }}
                      />
                      {isExpandable && (
                        <span className={`runner-expand-chevron${isExpanded ? ' runner-expand-chevron--open' : ''}`}>›</span>
                      )}
                    </div>
                    {isExpanded && (
                      <div className="runner-response-panel">
                        {row.status === 'testFailed' && row.testResults.length > 0 && (
                          <div className="runner-test-results">
                            <div className="runner-test-results-title">Failed Tests</div>
                            {row.testResults.map((t, i) => (
                              <div key={i} className={`runner-test-row runner-test-row--${t.passed ? 'pass' : 'fail'}`}>
                                <span className="runner-test-icon">{t.passed ? '✓' : '✗'}</span>
                                <span className="runner-test-expr">{t.expression}</span>
                                {!t.passed && t.message && (
                                  <span className="runner-test-msg">{t.message}</span>
                                )}
                              </div>
                            ))}
                          </div>
                        )}
                        <div className="runner-response-tabs">
                          <span className="runner-response-tab runner-response-tab--active">Response</span>
                          <span className="runner-response-tab-sep" />
                          <span className="runner-response-headers-count">
                            {Object.keys(row.responseHeaders).length} headers
                          </span>
                        </div>
                        <pre className="runner-response-body">{row.responseBody || '(empty body)'}</pre>
                        {tryPrettyPrint(row.responseBody).isJson && (
                          <div className="runner-response-footer">
                            <button
                              className="runner-expand-body-btn"
                              onClick={(e) => { e.stopPropagation(); setResponseModalRow(row); }}
                            >
                              ⤢ Expand
                            </button>
                          </div>
                        )}
                        {Object.keys(row.responseHeaders).length > 0 && (
                          <table className="runner-headers-table">
                            <tbody>
                              {Object.entries(row.responseHeaders).map(([key, vals]) => (
                                <tr key={key}>
                                  <td className="runner-header-key">{key}</td>
                                  <td className="runner-header-val">{vals.join(', ')}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        )}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* Terminal state banner */}
        {showSummary && terminalState === 'stopped_by_script' && (
          <div className="runner-terminal-banner runner-terminal-banner--script">
            Run stopped by script (<code>setNextRequest(null)</code>)
          </div>
        )}
        {showSummary && terminalState === 'stopped_by_loop_limit' && (
          <div className="runner-terminal-banner runner-terminal-banner--loop">
            Run halted: loop limit exceeded
          </div>
        )}

        {/* Summary bar */}
        {showSummary && (
          <div className="runner-summary">
            <span className="runner-summary-pass">{passCount} passed</span>
            <span className="runner-summary-sep">·</span>
            <span className="runner-summary-fail">{failCount} failed</span>
            {testFailCount > 0 && (
              <>
                <span className="runner-summary-sep">·</span>
                <span className="runner-summary-test-fail">{testFailCount} failed (tests)</span>
              </>
            )}
            <span className="runner-summary-sep">·</span>
            <span className="runner-summary-total">{totalDuration}ms</span>
            {runState === 'stopped' && (
              <span className="runner-summary-stopped">(stopped)</span>
            )}
          </div>
        )}

        {/* Footer */}
        <div className="runner-modal-footer">
          {isRunning ? (
            <button className="btn btn--danger" onClick={handleStop}>
              Stop
            </button>
          ) : (
            <button className="btn btn--secondary" onClick={handleClose}>
              Cancel
            </button>
          )}
          {showSummary && lastRunResult && !isRunning && (
            <button className="btn btn--secondary" onClick={handleExport}>
              Export JSON
            </button>
          )}
          <button
            className="btn btn--primary"
            onClick={handleStart}
            disabled={isRunning || enabledIDs.length === 0 || !!delayError}
          >
            {runState === 'done' || runState === 'stopped' ? 'Run Again' : 'Start'}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );

  const responseModalPortal = responseModalRow
    ? ReactDOM.createPortal(
        <div
          className="modal-backdrop"
          onClick={() => setResponseModalRow(null)}
          style={{ zIndex: 1100 }}
        >
          <div
            className="runner-response-detail-modal"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="runner-response-detail-header">
              <span className="runner-response-detail-title">
                {responseModalRow.name} — Response
              </span>
              <div className="runner-response-detail-actions">
                <button
                  className="btn btn--secondary"
                  onClick={() =>
                    navigator.clipboard.writeText(
                      tryPrettyPrint(responseModalRow.responseBody).text
                    )
                  }
                >
                  Copy
                </button>
                <button
                  className="runner-modal-close"
                  onClick={() => setResponseModalRow(null)}
                  aria-label="Close"
                >
                  ✕
                </button>
              </div>
            </div>
            <pre className="runner-response-detail-body">
              <JsonHighlighted
                text={tryPrettyPrint(responseModalRow.responseBody).text}
              />
            </pre>
          </div>
        </div>,
        document.body
      )
    : null;

  return (
    <>
      {runnerPortal}
      {responseModalPortal}
    </>
  );
};

// ── Container ──────────────────────────────────────────────

const CollectionRunnerContainer: React.FC = () => {
  const open = useRunnerStore((s) => s.open);
  const scope = useRunnerStore((s) => s.scope);
  const closeRunner = useRunnerStore((s) => s.closeRunner);

  if (!open || !scope) return null;

  return <CollectionRunner scope={scope} onClose={closeRunner} />;
};

export default CollectionRunnerContainer;
