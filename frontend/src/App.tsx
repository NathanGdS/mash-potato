import React, { useState } from 'react';
import Sidebar from './components/Sidebar';
import RequestEditor from './components/RequestEditor';
import ResponseViewer from './components/ResponseViewer';
import EnvironmentPanel from './components/EnvironmentPanel';
import EnvironmentSelector from './components/EnvironmentSelector';
import { useRequestsStore } from './store/requestsStore';
import './App.css';

const App: React.FC = () => {
  const activeRequest = useRequestsStore((s) => s.activeRequest);
  const [showEnvPanel, setShowEnvPanel] = useState(false);

  return (
    <div className="app-layout">
      <Sidebar />
      <main className="app-main">
        <div className="app-topbar">
          <span className="app-brand">
            🥔 <strong>Mash</strong> Potato
          </span>
          <div className="app-topbar-controls">
            <button
              className="app-env-btn"
              title="Manage Environments"
              onClick={() => setShowEnvPanel(true)}
              aria-label="Manage Environments"
            >
              Environments
            </button>
            <EnvironmentSelector />
          </div>
        </div>
        {activeRequest ? (
          <div className="app-workspace">
            <div className="app-request-pane">
              <RequestEditor request={activeRequest} />
            </div>
            <div className="app-response-pane">
              <ResponseViewer />
            </div>
          </div>
        ) : (
          <div className="app-placeholder">
            <p>Select a request to start editing.</p>
          </div>
        )}
      </main>
      {showEnvPanel && <EnvironmentPanel onClose={() => setShowEnvPanel(false)} />}
    </div>
  );
};

export default App;
