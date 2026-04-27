import React, { useState } from 'react';
import { useResponseStore } from '../store/responseStore';
import StatusBadge from './StatusBadge';
import MetricsBar from './MetricsBar';
import ResponseBody from './ResponseBody';
import ResponseHeaders from './ResponseHeaders';
import TestResults from './TestResults';
import ConsolePanel from './ConsolePanel';
import TimingWaterfall from './TimingWaterfall';
import { tryPrettyPrint } from '../utils/jsonHighlighter';
import { httpclient } from '../../wailsjs/go/models';

type ResponseTab = 'body' | 'headers' | 'tests' | 'console' | 'timing';

const ResponseViewer: React.FC = () => {
  const { responses, activeRequestId } = useResponseStore();
  const response = (activeRequestId ? responses[activeRequestId] : null) as httpclient.ResponseResult | null;
  const [activeTab, setActiveTab] = useState<ResponseTab>('body');
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    if (!response?.Body) return;
    try {
      const { text } = tryPrettyPrint(response.Body);
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy response body', err);
    }
  };

  if (!response) {
    return (
      <div className="response-viewer response-viewer--empty">
        <p className="response-viewer-placeholder">Hit Send to see the response.</p>
      </div>
    );
  }

  return (
    <div className="response-viewer">
      {/* Toolbar: status badge + metrics */}
      <div className="response-viewer-toolbar">
        <StatusBadge statusCode={response.StatusCode} statusText={response.StatusText} />
        <MetricsBar durationMs={response.DurationMs} sizeBytes={response.SizeBytes} />
        <button 
          className={`rv-copy-btn${copied ? ' rv-copy-btn--success' : ''}`}
          onClick={handleCopy}
          title="Copy response body"
        >
          {copied ? 'Copied!' : 'Copy'}
        </button>
      </div>

      {/* Tab navigation */}
      <div className="response-viewer-tabs">
        {(['body', 'headers', 'tests', 'console', 'timing'] as ResponseTab[]).map((tab) => {
          const consoleLogs = (response as any).consoleLogs as string[] | undefined;
          const scriptErrors = (response as any).scriptErrors as string[] | undefined;
          const consoleCount = (consoleLogs?.length ?? 0) + (scriptErrors?.length ?? 0);
          return (
            <button
              key={tab}
              className={`rv-tab${activeTab === tab ? ' rv-tab--active' : ''}`}
              onClick={() => setActiveTab(tab)}
            >
              {tab.charAt(0).toUpperCase() + tab.slice(1)}
              {tab === 'headers' && (
                <span className="rv-tab-count">
                  {Object.keys(response.Headers).length}
                </span>
              )}
              {tab === 'tests' && response.TestResults && response.TestResults.length > 0 && (
                <span className="rv-tab-count">
                  {response.TestResults.length}
                </span>
              )}
              {tab === 'console' && consoleCount > 0 && (
                <span className={`rv-tab-count${scriptErrors && scriptErrors.length > 0 ? ' rv-tab-count--error' : ''}`}>
                  {consoleCount}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Tab content */}
      <div className="response-viewer-panel">
        {activeTab === 'body' && <ResponseBody body={response.Body} />}
        {activeTab === 'headers' && <ResponseHeaders headers={response.Headers} />}
        {activeTab === 'tests' && <TestResults results={response.TestResults} />}
        {activeTab === 'console' && (
          <ConsolePanel
            logs={(response as any).consoleLogs ?? []}
            errors={(response as any).scriptErrors ?? []}
          />
        )}
        {activeTab === 'timing' && (
          response?.Timing
            ? <TimingWaterfall timing={response.Timing} />
            : <p className="response-viewer-placeholder">Send a request to see timing data.</p>
        )}
      </div>
    </div>
  );
};

export default ResponseViewer;
