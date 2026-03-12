import React, { useState } from 'react';
import { useResponseStore } from '../store/responseStore';
import StatusBadge from './StatusBadge';
import MetricsBar from './MetricsBar';
import ResponseBody from './ResponseBody';
import ResponseHeaders from './ResponseHeaders';

type ResponseTab = 'body' | 'headers';

const ResponseViewer: React.FC = () => {
  const { response, error } = useResponseStore();
  const [activeTab, setActiveTab] = useState<ResponseTab>('body');

  if (error) {
    return (
      <div className="response-viewer response-viewer--error" role="alert">
        <span className="response-viewer-error-icon">!</span>
        <span className="response-viewer-error-text">{error}</span>
      </div>
    );
  }

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
      </div>

      {/* Tab navigation */}
      <div className="response-viewer-tabs">
        {(['body', 'headers'] as ResponseTab[]).map((tab) => (
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
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="response-viewer-panel">
        {activeTab === 'body' && <ResponseBody body={response.Body} />}
        {activeTab === 'headers' && <ResponseHeaders headers={response.Headers} />}
      </div>
    </div>
  );
};

export default ResponseViewer;
