import React from 'react';

interface ConsolePanelProps {
  logs: string[];
  errors: string[];
}

const ConsolePanel: React.FC<ConsolePanelProps> = ({ logs, errors }) => {
  const hasLogs = logs && logs.length > 0;
  const hasErrors = errors && errors.length > 0;

  if (!hasLogs && !hasErrors) {
    return (
      <div className="console-panel console-panel--empty">
        <p className="console-panel-placeholder">No script output.</p>
      </div>
    );
  }

  return (
    <div className="console-panel">
      {hasLogs && (
        <section className="console-panel-section">
          <h3 className="console-panel-section-title">Output</h3>
          <pre className="console-panel-pre console-panel-pre--output">
            {logs.join('\n')}
          </pre>
        </section>
      )}
      {hasErrors && (
        <section className="console-panel-section">
          <h3 className="console-panel-section-title console-panel-section-title--error">Errors</h3>
          <pre className="console-panel-pre console-panel-pre--error">
            {errors.join('\n')}
          </pre>
        </section>
      )}
    </div>
  );
};

export default ConsolePanel;
